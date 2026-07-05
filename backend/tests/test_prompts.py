import uuid
from datetime import datetime, timedelta, timezone

from app.models.extraction_task import ExtractionTask
from app.models.ontology import OntologyProject
from app.models.prompt import Prompt


def test_create_prompt(client, auth_headers):
    r = client.post("/api/v1/prompts",
                    json={"name": "测试提示词", "domain": "供应链", "content": "提取实体..."},
                    headers=auth_headers)
    assert r.status_code == 201
    assert r.json()["data"]["name"] == "测试提示词"

def test_list_prompts(client, auth_headers):
    client.post("/api/v1/prompts", json={"name": "P1", "domain": "供应链", "content": "content"}, headers=auth_headers)
    r = client.get("/api/v1/prompts", headers=auth_headers)
    assert r.status_code == 200
    assert len(r.json()["data"]) >= 1

def test_list_prompts_by_domain(client, auth_headers):
    client.post("/api/v1/prompts", json={"name": "SC", "domain": "供应链", "content": "c"}, headers=auth_headers)
    client.post("/api/v1/prompts", json={"name": "FIN", "domain": "财务", "content": "c"}, headers=auth_headers)
    r = client.get("/api/v1/prompts?domain=供应链", headers=auth_headers)
    assert all(p["domain"] == "供应链" for p in r.json()["data"])

def test_update_prompt(client, auth_headers):
    r = client.post("/api/v1/prompts", json={"name": "P", "domain": "医疗", "content": "old"}, headers=auth_headers)
    pid = r.json()["data"]["id"]
    r2 = client.put(f"/api/v1/prompts/{pid}", json={"content": "new content"}, headers=auth_headers)
    assert r2.json()["data"]["content"] == "new content"

def test_delete_prompt(client, auth_headers):
    r = client.post("/api/v1/prompts", json={"name": "Del", "domain": "其他", "content": "c"}, headers=auth_headers)
    pid = r.json()["data"]["id"]
    r2 = client.delete(f"/api/v1/prompts/{pid}", headers=auth_headers)
    assert r2.status_code == 204


def test_delete_prompt_detaches_extraction_tasks(client, auth_headers, ontology, db):
    prompt = Prompt(id=str(uuid.uuid4()), name="Used", domain="其他", content="c", created_by=ontology["created_by"])
    task = ExtractionTask(id=str(uuid.uuid4()), ontology_id=ontology["id"], prompt_id=prompt.id)
    db.add(prompt)
    db.add(task)
    db.commit()

    r = client.delete(f"/api/v1/prompts/{prompt.id}", headers=auth_headers)

    assert r.status_code == 204
    db.refresh(task)
    assert task.prompt_id is None


def test_seed_db_repoints_tasks_before_deduping_builtin_prompts(db, admin_user, monkeypatch):
    from app import main
    from app.routers.prompts import BUILTIN_PROMPTS

    class NoCloseSession:
        def __init__(self, session):
            self.session = session

        def __getattr__(self, name):
            return getattr(self.session, name)

        def close(self):
            pass

    builtin = BUILTIN_PROMPTS[0]
    now = datetime.now(timezone.utc)
    older = Prompt(
        id=str(uuid.uuid4()),
        name=builtin["name"],
        domain=builtin["domain"],
        content="old",
        created_by=admin_user.id,
        created_at=now - timedelta(minutes=1),
    )
    newer = Prompt(
        id=str(uuid.uuid4()),
        name=builtin["name"],
        domain=builtin["domain"],
        content="new",
        created_by=admin_user.id,
        created_at=now,
    )
    ontology = OntologyProject(id=str(uuid.uuid4()), name="Seed Dedupe", domain="其他", created_by=admin_user.id)
    task = ExtractionTask(id=str(uuid.uuid4()), ontology_id=ontology.id, prompt_id=older.id)
    db.add_all([older, newer, ontology, task])
    db.commit()

    monkeypatch.setattr(main, "SessionLocal", lambda: NoCloseSession(db))
    monkeypatch.setattr(main, "engine", db.get_bind())

    main._seed_db()

    remaining = db.query(Prompt).filter(Prompt.name == builtin["name"], Prompt.domain == builtin["domain"]).all()
    db.refresh(task)
    assert len(remaining) == 1
    assert task.prompt_id == remaining[0].id
