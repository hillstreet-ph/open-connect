import os

from fastapi.testclient import TestClient

os.environ.setdefault("OC_PUBLIC_BASE_URL", "https://control.open-connect.site")
os.environ.setdefault("OC_OIDC_ISSUER", "https://example.supabase.co/auth/v1")

from app.main import app  # noqa: E402


client = TestClient(app)


def test_root_is_a_safe_readiness_endpoint() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "open-connect-control",
    }


def test_capabilities_remain_authenticated() -> None:
    response = client.get("/api/v1/capabilities")

    assert response.status_code == 401


def test_agent_registry_remains_authenticated() -> None:
    response = client.get("/api/v1/agents")
    assert response.status_code == 401


def test_collaboration_planning_remains_authenticated() -> None:
    response = client.post(
        "/api/v1/collaborations/plan",
        json={"goal": "test", "project": "open-connect"},
    )
    assert response.status_code == 401
