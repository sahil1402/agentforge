"""AgentForge execution engine: runs transpiled graphs and streams their trace events.

The Next.js app owns runs (creates the row, transpiles the graph) and calls this service;
the browser only talks to the WebSocket.
"""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

# Same env file as the Next.js app (DATABASE_URL, provider API keys); real env vars win.
load_dotenv(Path(__file__).resolve().parents[2] / ".env.local")

from . import db, runner  # noqa: E402 — needs the env loaded


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await db.connect()
    # Runs live in this process, so any still marked active were cut off by a restart.
    await db.fail_active_runs("Execution engine restarted")
    yield
    await runner.shutdown()
    await db.close()


app = FastAPI(title="AgentForge execution engine", lifespan=lifespan)


class StartRun(BaseModel):
    code: str = Field(min_length=1, description="Transpiled LangGraph module (defines `graph`)")
    nodeIds: dict[str, str] = Field(default_factory=dict, description="LangGraph node name → canvas node id")
    input: dict[str, Any] = Field(default_factory=dict)


class GateDecision(BaseModel):
    decision: Literal["approve", "reject"]


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/runs/{run_id}/start", status_code=status.HTTP_202_ACCEPTED)
async def start_run(run_id: str, body: StartRun) -> dict[str, str]:
    if run_id in runner.RUNS:
        raise HTTPException(status.HTTP_409_CONFLICT, "Run already started")
    if not await db.run_exists(run_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    await runner.start(run_id, body.model_dump())
    return {"runId": run_id, "status": "RUNNING"}


@app.post("/runs/{run_id}/gate", status_code=status.HTTP_202_ACCEPTED)
async def resolve_gate(run_id: str, body: GateDecision) -> dict[str, str]:
    if not runner.decide(run_id, body.decision == "approve"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Run is not waiting at a gate")
    return {"runId": run_id, "decision": body.decision}


@app.post("/runs/{run_id}/cancel", status_code=status.HTTP_202_ACCEPTED)
async def cancel_run(run_id: str) -> dict[str, str]:
    if not runner.cancel(run_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Run is not running")
    return {"runId": run_id, "status": "CANCELLING"}


@app.websocket("/ws/runs/{run_id}")
async def run_events(ws: WebSocket, run_id: str) -> None:
    """Replay the run's events so far, then stream live ones until it finishes."""
    await ws.accept()
    live = runner.subscribe(run_id)
    try:
        if live is None:  # finished (or never ran here): replay what was stored
            for event in await db.events(run_id):
                await ws.send_json(event)
        else:
            backlog, queue = live
            for event in backlog:
                await ws.send_json(event)
            # Clients never send, so receive() only returns when they go away — stop then,
            # rather than lingering (and blocking shutdown) until the run's next event.
            gone = asyncio.ensure_future(ws.receive())
            try:
                while True:
                    nxt = asyncio.ensure_future(queue.get())
                    await asyncio.wait({nxt, gone}, return_when=asyncio.FIRST_COMPLETED)
                    if not nxt.done():
                        nxt.cancel()
                        return
                    if (event := nxt.result()) is None:
                        break
                    await ws.send_json(event)
            finally:
                gone.cancel()
        await ws.close()
    except (WebSocketDisconnect, RuntimeError):  # client went away mid-stream
        pass
    finally:
        if live:
            runner.unsubscribe(run_id, live[1])
