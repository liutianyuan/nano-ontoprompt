from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime, timedelta, timezone
from app.deps import get_db, get_current_user
from app.models.ontology import OntologyProject
from app.models.entity import Entity
from app.models.relation import Relation
from app.models.user import User
from app.models.extraction_task import ExtractionTask
from app.models.v2.mapping import OntologyMapping
from app.schemas.ontology import OntologyCreate, OntologyOut, OntologyListItem, OntologyUpdate
import uuid

router = APIRouter()
STALE_CREATING_AFTER = timedelta(minutes=10)


def _as_utc(dt):
    if not dt:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _repair_stale_creating_status(project: OntologyProject, db: Session) -> bool:
    if project.status != "creating":
        return False

    latest_task = (
        db.query(ExtractionTask)
        .filter(ExtractionTask.ontology_id == project.id)
        .order_by(ExtractionTask.created_at.desc())
        .first()
    )
    if latest_task and latest_task.status == "completed":
        project.status = "created"
        return True
    if latest_task and latest_task.status == "failed":
        project.status = "failed"
        return True

    updated_at = _as_utc(project.updated_at or project.created_at)
    if updated_at and datetime.now(timezone.utc) - updated_at < STALE_CREATING_AFTER:
        return False

    entity_count = db.query(func.count(Entity.id)).filter(Entity.ontology_id == project.id).scalar() or 0
    applied_mapping_count = (
        db.query(func.count(OntologyMapping.id))
        .filter(OntologyMapping.ontology_id == project.id, OntologyMapping.status == "applied")
        .scalar()
        or 0
    )
    if entity_count > 0 or applied_mapping_count > 0:
        project.status = "created"
    else:
        project.status = "failed"
    return True

@router.get("")
def list_ontologies(
    name: Optional[str] = None,
    page: int = 1, page_size: int = 20,
    db: Session = Depends(get_db), _=Depends(get_current_user)
):
    q = db.query(OntologyProject)
    if name:
        q = q.filter(OntologyProject.name.ilike(f"%{name}%"))
    total = q.count()
    items = q.order_by(OntologyProject.updated_at.desc()).offset((page-1)*page_size).limit(page_size).all()
    repaired = False
    result = []
    for item in items:
        repaired = _repair_stale_creating_status(item, db) or repaired
        d = OntologyListItem.model_validate(item).model_dump()
        d['entity_count'] = db.query(func.count(Entity.id)).filter(Entity.ontology_id == item.id).scalar() or 0
        d['relation_count'] = db.query(func.count(Relation.id)).filter(Relation.ontology_id == item.id).scalar() or 0
        result.append(d)
    if repaired:
        db.commit()
    return {"data": {"items": result, "total": total, "page": page, "page_size": page_size}}

@router.post("", status_code=201)
def create_ontology(body: OntologyCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    existing = db.query(OntologyProject).filter(OntologyProject.name.ilike(body.name)).first()
    if existing:
        raise HTTPException(status_code=409, detail={"error": "DUPLICATE_NAME", "message": f"Ontology 名称「{body.name}」已存在", "existing_id": existing.id})
    project = OntologyProject(id=str(uuid.uuid4()), name=body.name, domain=body.domain,
                               description=body.description, build_mode=body.build_mode or "simple_llm",
                               created_by=current_user.id)
    db.add(project); db.commit(); db.refresh(project)
    return {"data": OntologyOut.model_validate(project).model_dump()}

@router.get("/{ontology_id}")
def get_ontology(ontology_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    p = db.query(OntologyProject).filter(OntologyProject.id == ontology_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    if _repair_stale_creating_status(p, db):
        db.commit()
        db.refresh(p)
    return {"data": OntologyOut.model_validate(p).model_dump()}

@router.put("/{ontology_id}")
def update_ontology(ontology_id: str, body: OntologyUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    p = db.query(OntologyProject).filter(OntologyProject.id == ontology_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    db.commit(); db.refresh(p)
    return {"data": OntologyOut.model_validate(p).model_dump()}

@router.delete("/{ontology_id}", status_code=204)
def delete_ontology(ontology_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    p = db.query(OntologyProject).filter(OntologyProject.id == ontology_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    db.delete(p); db.commit()
