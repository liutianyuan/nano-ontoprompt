import asyncio
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.deps import get_db, get_current_user
from app.models.extraction_task import ExtractionTask
from app.models.ontology import OntologyProject
from app.schemas.extraction import ExtractionRequest, ExtractionTaskOut

router = APIRouter()

TERMINAL_STATUSES = {"completed", "failed"}


def _as_utc(dt):
    if not dt:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _task_payload(task: ExtractionTask) -> dict:
    return ExtractionTaskOut.model_validate(task).model_dump(mode="json")


def _normalize_task_status(db: Session, task: ExtractionTask) -> ExtractionTask:
    project = db.query(OntologyProject).filter(OntologyProject.id == task.ontology_id).first()
    changed = False

    if project and project.status == "failed" and task.status not in TERMINAL_STATUSES:
        task.status = "failed"
        task.error = task.error or "Extraction failed. Check backend logs for details."
        changed = True

    if task.status not in TERMINAL_STATUSES:
        updated_at = _as_utc(task.updated_at or task.created_at)
        progress = task.progress or {}
        stall_timeout = settings.extraction_stall_timeout_seconds
        if progress.get("stage") in {"calling LLM", "inferring relations"}:
            stall_timeout = max(stall_timeout, settings.llm_max_timeout_seconds + 60)
            if progress.get("chunks"):
                stall_timeout = max(stall_timeout, (settings.llm_max_timeout_seconds + 60) * int(progress.get("chunks") or 1))
        if updated_at and (datetime.now(timezone.utc) - updated_at).total_seconds() > stall_timeout:
            progress = task.progress or {}
            task.status = "failed"
            task.error = task.error or (
                f"Extraction stalled at {progress.get('pct', 0)}% · "
                f"{progress.get('stage', 'unknown')} for more than "
                f"{stall_timeout} seconds."
            )
            if project:
                project.status = "failed"
            changed = True

    if changed:
        db.commit()
        db.refresh(task)
    return task

@router.post("")
def start_extraction(ontology_id: str, body: ExtractionRequest, db: Session = Depends(get_db), _=Depends(get_current_user)):
    project = db.query(OntologyProject).filter(OntologyProject.id == ontology_id).first()
    if not project:
        raise HTTPException(404, "Ontology not found")

    task = ExtractionTask(
        id=str(uuid.uuid4()),
        ontology_id=ontology_id,
        prompt_id=body.prompt_id,
        model_id=body.model_id,
        status="queued",
        parameters={"model_name": body.model_name, "file_ids": body.file_ids, "constraints": body.constraints or []},
        progress={"stage": "queued", "pct": 0},
    )
    db.add(task); db.commit(); db.refresh(task)

    # Update ontology status
    project.status = "creating"
    db.commit()

    # Queue Celery task
    try:
        from app.tasks.extraction import run_extraction
        run_extraction.delay(task.id)
    except Exception:
        # If celery not available, run synchronously in background thread
        import threading
        def run_sync():
            from app.tasks.extraction import run_extraction
            try:
                run_extraction(task.id)
            except Exception:
                pass
        threading.Thread(target=run_sync, daemon=True).start()

    return {"data": {"task_id": task.id}, "message": "Extraction queued"}

@router.get("/status")
def get_extraction_status(ontology_id: str, task_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    task = db.query(ExtractionTask).filter(ExtractionTask.id == task_id, ExtractionTask.ontology_id == ontology_id).first()
    if not task:
        raise HTTPException(404, "Task not found")
    task = _normalize_task_status(db, task)
    return {"data": _task_payload(task)}


@router.get("/latest")
def get_latest_extraction(ontology_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    task = (
        db.query(ExtractionTask)
        .filter(ExtractionTask.ontology_id == ontology_id)
        .order_by(ExtractionTask.created_at.desc())
        .first()
    )
    if not task:
        return {"data": None}
    task = _normalize_task_status(db, task)
    return {"data": _task_payload(task)}


@router.get("/status/stream")
async def stream_extraction_status(ontology_id: str, task_id: str, _=Depends(get_current_user)):
    stream_id = str(uuid.uuid4())

    def load_status() -> dict:
        db = SessionLocal()
        try:
            task = (
                db.query(ExtractionTask)
                .filter(ExtractionTask.id == task_id, ExtractionTask.ontology_id == ontology_id)
                .first()
            )
            if not task:
                return {"status": "failed", "error": "Task not found", "progress": {"stage": "error", "pct": 0}}
            return _task_payload(_normalize_task_status(db, task))
        finally:
            db.close()

    async def events():
        last = None
        try:
            while True:
                payload = load_status()
                encoded = json.dumps(payload, ensure_ascii=False)
                if encoded != last:
                    yield f"id: {stream_id}\nevent: status\ndata: {encoded}\n\n"
                    last = encoded
                if payload.get("status") in TERMINAL_STATUSES:
                    break
                await asyncio.sleep(2)
        except asyncio.CancelledError:
            return

    return StreamingResponse(events(), media_type="text/event-stream")
