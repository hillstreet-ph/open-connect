"""Isolated, authenticated OpenHands Cloud MCP HTTP gateway."""
import hmac
import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

API_BASE = "https://app.all-hands.dev"
ALLOWED_TOOLS = {"list_conversations", "get_conversation", "get_start_task", "start_conversation"}

class Call(BaseModel):
    name: str
    arguments: dict = Field(default_factory=dict)

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.getenv("OPENHANDS_API_KEY") or not os.getenv("GATEWAY_BEARER_TOKEN"):
        raise RuntimeError("Missing protected OPENHANDS_API_KEY or GATEWAY_BEARER_TOKEN")
    yield

app = FastAPI(title="OpenHands private gateway", lifespan=lifespan)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/tools/call")
async def call_tool(call: Call, authorization: str | None = Header(default=None)):
    expected = os.environ["GATEWAY_BEARER_TOKEN"]
    if not authorization or not hmac.compare_digest(authorization, "Bearer " + expected):
        raise HTTPException(401, "Unauthorized")
    if call.name not in ALLOWED_TOOLS:
        raise HTTPException(403, "Tool not enabled")
    args = call.arguments
    if call.name == "list_conversations":
        method, path, payload, params = "GET", "/api/v1/app-conversations/search", None, {"limit": min(max(int(args.get("limit", 20)), 1), 100)}
    elif call.name == "get_conversation":
        method, path, payload, params = "GET", "/api/v1/app-conversations", None, {"ids": str(args["id"])}
    elif call.name == "get_start_task":
        method, path, payload, params = "GET", "/api/v1/app-conversations/start-tasks", None, {"ids": str(args["id"])}
    else:
        repository = str(args["repository"])
        allowed = {r.strip() for r in os.getenv("ALLOWED_REPOSITORIES", "").split(",") if r.strip()}
        if repository not in allowed:
            raise HTTPException(403, "Repository not allowlisted")
        method, path, params = "POST", "/api/v1/app-conversations", None
        payload = {"selected_repository": repository, "initial_message": {"content": [{"type": "text", "text": str(args["message"])}]}}
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=False) as client:
            response = await client.request(method, API_BASE + path, headers={"Authorization": "Bearer " + os.environ["OPENHANDS_API_KEY"]}, json=payload, params=params)
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, "Upstream OpenHands request failed") from exc
