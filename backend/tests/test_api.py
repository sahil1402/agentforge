"""Engine API end to end: real worker subprocesses (fake models), in-memory stand-in for Postgres."""

import json
import sys
import time
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from starlette.testclient import WebSocketTestSession

from app import db, main, runner

FIXTURES = Path(__file__).parent / "fixtures"
NOISY_GRAPH = '''
import subprocess, sys
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages

class S(TypedDict):
    messages: Annotated[list, add_messages]

def noisy(state):
    print("debug output from a tool")  # none of this may corrupt the worker protocol
    subprocess.run([sys.executable, "-c", "print('output from a child process')"])
    print("raw", file=sys.__stdout__, flush=True)
    return {"messages": [("ai", "done")]}

b = StateGraph(S)
b.add_node("noisy", noisy)
b.add_edge(START, "noisy")
b.add_edge("noisy", END)
graph = b.compile()
'''


class FakeDB:
    def __init__(self) -> None:
        self.runs: dict[str, dict[str, Any]] = {}
        self.events: dict[str, list[dict[str, Any]]] = {}

    def install(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def noop() -> None: ...

        async def run_exists(run_id: str) -> bool:
            return run_id in self.runs

        async def add_event(run_id: str, sequence: int, event_type: str, node_id: str | None,
                            payload: dict[str, Any], ts: datetime) -> None:
            self.events.setdefault(run_id, []).append(
                {"type": event_type, "nodeId": node_id, "payload": payload, "sequence": sequence, "ts": db.iso(ts)})

        async def set_status(run_id: str, status: str) -> None:
            self.runs[run_id]["statuses"].append(status)

        async def finish(run_id: str, status: str, **fields: Any) -> None:
            self.runs[run_id]["statuses"].append(status)
            self.runs[run_id].update(fields)

        async def events(run_id: str) -> list[dict[str, Any]]:
            return self.events.get(run_id, [])

        async def fail_active_runs(reason: str) -> None: ...

        for name, fn in [("connect", noop), ("close", noop), ("fail_active_runs", fail_active_runs),
                         ("run_exists", run_exists), ("add_event", add_event),
                         ("set_status", set_status), ("finish", finish), ("events", events)]:
            monkeypatch.setattr(db, name, fn)

    def add_run(self, run_id: str) -> None:
        self.runs[run_id] = {"statuses": []}


@pytest.fixture
def fake_db(monkeypatch: pytest.MonkeyPatch) -> FakeDB:
    store = FakeDB()
    store.install(monkeypatch)
    monkeypatch.setattr(runner, "WORKER_CMD", [sys.executable, "-m", "tests.fake_worker"])
    return store


@pytest.fixture
def client(fake_db: FakeDB) -> Iterator[TestClient]:
    with TestClient(main.app) as c:  # one event loop for the whole test, so runs outlive requests
        yield c


def fixture_job(name: str, query: str) -> dict[str, Any]:
    return {**json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8")), "input": {"query": query}}


def receive_until(ws: WebSocketTestSession, event_type: str) -> list[dict[str, Any]]:
    events = [ws.receive_json()]
    while events[-1]["type"] != event_type:
        events.append(ws.receive_json())
    return events


def test_start_validates_input(client: TestClient, fake_db: FakeDB) -> None:
    assert client.post("/runs/missing/start", json={"code": "x"}).status_code == 404
    fake_db.add_run("r1")
    assert client.post("/runs/r1/start", json={"code": ""}).status_code == 422


def test_run_streams_events_and_records_the_result(client: TestClient, fake_db: FakeDB) -> None:
    fake_db.add_run("r1")
    assert client.post("/runs/r1/start", json=fixture_job("code_review", "def f(): pass")).status_code == 202
    with client.websocket_connect("/ws/runs/r1") as ws:
        events = receive_until(ws, "COMPLETE")
    assert [e["sequence"] for e in events] == list(range(1, len(events) + 1))
    assert {e["nodeId"] for e in events if e["type"] == "NODE_END"} == {"analyzer", "style", "bugs", "perf", "summary"}
    run = fake_db.runs["r1"]
    assert run["statuses"] == ["RUNNING", "COMPLETE"]
    assert run["output"] == {"output": "answer from claude-sonnet-5-5"} and run["tokens"] == 75
    assert fake_db.events["r1"] == events  # everything streamed was also persisted

    # After the run: the WebSocket replays the stored events.
    with client.websocket_connect("/ws/runs/r1") as ws:
        assert receive_until(ws, "COMPLETE") == events


def test_gate_pauses_until_a_decision_arrives(client: TestClient, fake_db: FakeDB) -> None:
    fake_db.add_run("r2")
    client.post("/runs/r2/start", json=fixture_job("support", "I want a refund"))
    with client.websocket_connect("/ws/runs/r2") as ws:
        assert receive_until(ws, "GATE_PENDING")[-1]["nodeId"] == "gate"
        assert fake_db.runs["r2"]["statuses"][-1] == "AWAITING_HUMAN"
        assert client.post("/runs/r2/start", json=fixture_job("support", "x")).status_code == 409  # already running
        assert client.post("/runs/r2/gate", json={"decision": "maybe"}).status_code == 422
        assert client.post("/runs/r2/gate", json={"decision": "approve"}).status_code == 202
        assert client.post("/runs/r2/gate", json={"decision": "approve"}).status_code == 409  # no longer waiting
        rest = receive_until(ws, "COMPLETE")
    assert rest[0] == {**rest[0], "type": "GATE_RESOLVED", "payload": {"decision": "approve"}}
    assert fake_db.runs["r2"]["statuses"] == ["RUNNING", "AWAITING_HUMAN", "RUNNING", "COMPLETE"]


def test_rejected_gate_fails_the_run(client: TestClient, fake_db: FakeDB) -> None:
    fake_db.add_run("r3")
    client.post("/runs/r3/start", json=fixture_job("support", "refund"))
    with client.websocket_connect("/ws/runs/r3") as ws:
        receive_until(ws, "GATE_PENDING")
        client.post("/runs/r3/gate", json={"decision": "reject"})
        error = receive_until(ws, "ERROR")[-1]
    assert "Rejected at gate" in error["payload"]["message"]
    assert fake_db.runs["r3"]["statuses"][-1] == "FAILED"
    assert "Rejected at gate" in fake_db.runs["r3"]["error"]


def test_cancel_stops_a_run_waiting_at_a_gate(client: TestClient, fake_db: FakeDB) -> None:
    assert client.post("/runs/nope/cancel").status_code == 409
    fake_db.add_run("r5")
    client.post("/runs/r5/start", json=fixture_job("support", "refund"))
    with client.websocket_connect("/ws/runs/r5") as ws:
        receive_until(ws, "GATE_PENDING")
        assert client.post("/runs/r5/cancel").status_code == 202
        error = receive_until(ws, "ERROR")[-1]
    assert error["payload"]["message"] == "Cancelled by user"
    assert fake_db.runs["r5"]["statuses"][-1] == "FAILED"


def test_shutdown_stops_runs_even_with_an_idle_subscriber(fake_db: FakeDB) -> None:
    fake_db.add_run("r6")
    started = time.monotonic()
    with TestClient(main.app) as c:
        c.post("/runs/r6/start", json=fixture_job("support", "refund"))
        with c.websocket_connect("/ws/runs/r6") as ws:
            receive_until(ws, "GATE_PENDING")
        # The tab is gone and the run sits at its gate; leaving the block shuts the engine down.
    assert time.monotonic() - started < 15
    assert fake_db.runs["r6"]["statuses"][-1] == "FAILED"
    assert fake_db.runs["r6"]["error"] == "Execution engine stopped"
    assert not runner.RUNS


def test_prints_in_user_code_do_not_break_the_stream(client: TestClient, fake_db: FakeDB) -> None:
    fake_db.add_run("r4")
    client.post("/runs/r4/start", json={"code": NOISY_GRAPH, "nodeIds": {"noisy": "n1"}})
    with client.websocket_connect("/ws/runs/r4") as ws:
        events = receive_until(ws, "COMPLETE")
    assert events[-1]["payload"]["output"] == "done"
