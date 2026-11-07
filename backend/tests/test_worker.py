"""The worker runs real transpiler output (fixtures/, kept in sync by the Jest suite) with fake models."""

import asyncio
import json
from pathlib import Path
from typing import Any

import pytest

from tests import fakes

fakes.install()

from app import worker  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"
FAILING_GRAPH = '''
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages

class S(TypedDict):
    messages: Annotated[list, add_messages]

def boom(state):
    raise ValueError("tool exploded")

b = StateGraph(S)
b.add_node("boom", boom)
b.add_edge(START, "boom")
b.add_edge("boom", END)
graph = b.compile()
'''


# Two gates in parallel branches pause at the same time (shape of transpiled gate nodes).
PARALLEL_GATES = '''
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.types import interrupt
from langgraph.checkpoint.memory import InMemorySaver

class S(TypedDict):
    messages: Annotated[list, add_messages]

class GateRejected(Exception):
    pass

def gate(name):
    def node(state):
        decision = interrupt({"prompt": f"ok {name}?", "last_output": "", "timeout_seconds": 5})
        if not decision.get("approved"):
            raise GateRejected(name)
        return {"messages": [("ai", f"{name} approved")]}
    return node

b = StateGraph(S)
b.add_node("g1", gate("g1"))
b.add_node("g2", gate("g2"))
b.add_edge(START, "g1")
b.add_edge(START, "g2")
b.add_edge(["g1", "g2"], END)
graph = b.compile(checkpointer=InMemorySaver())
'''

# One branch is still running when the other fails.
PARALLEL_FAILURE = '''
import time
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages

class S(TypedDict):
    messages: Annotated[list, add_messages]

def slow(state):
    time.sleep(0.3)
    return {"messages": []}

def bad(state):
    raise ValueError("boom in bad")

b = StateGraph(S)
b.add_node("slow", slow)
b.add_node("bad", bad)
b.add_edge(START, "slow")
b.add_edge(START, "bad")
b.add_edge(["slow", "bad"], END)
graph = b.compile()
'''


def job(name: str, query: str = "hello") -> dict[str, Any]:
    return {**json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8")), "input": {"query": query}}


def run(job: dict[str, Any], decisions: list[bool | None] | None = None) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    pending = list(decisions or [])

    async def read_decision(_timeout: float | None) -> bool | None:
        return pending.pop(0)

    fakes.CALLS.clear()
    asyncio.run(worker.run(job, events.append, read_decision))
    terminal = [e for e in events if e["type"] in ("COMPLETE", "ERROR")]
    assert terminal == [events[-1]], "exactly one terminal event, and it comes last"
    return events


def steps(events: list[dict[str, Any]]) -> list[tuple[str, str | None]]:
    return [(e["type"], e.get("nodeId")) for e in events if e["type"] != "TOKEN_CHUNK"]


def test_parallel_fan_out_joins_once() -> None:
    events = run(job("code_review"))
    s = steps(events)
    assert s[:2] == [("NODE_START", "analyzer"), ("NODE_END", "analyzer")]
    assert {n for t, n in s[2:8] if t == "NODE_START"} == {"style", "bugs", "perf"}
    assert s[-3:] == [("NODE_START", "summary"), ("NODE_END", "summary"), ("COMPLETE", None)]
    assert events[-1]["payload"] == {"output": "answer from claude-sonnet-5-5", "tokens": 5 * 15}
    model, prompt = fakes.CALLS[-1]
    assert model == "claude-sonnet-5-5"
    assert [m.type for m in prompt] == ["system", "human"]  # always ends on a user turn
    assert all(f"Output from {n}:" in prompt[1].content for n in ("analyzer", "style", "bugs", "perf"))


def test_tokens_are_attributed_to_their_node() -> None:
    chunks = [(e["nodeId"], e["payload"]["chunk"]) for e in run(job("code_review")) if e["type"] == "TOKEN_CHUNK"]
    assert ("analyzer", "answer from gpt-4o") in chunks
    assert ("summary", "answer from claude-sonnet-5-5") in chunks


def test_node_end_carries_the_nodes_usage_and_duration() -> None:
    ends = [e["payload"] for e in run(job("code_review")) if e["type"] == "NODE_END"]
    assert [(p["inputTokens"], p["outputTokens"]) for p in ends] == [(10, 5)] * 5  # FakeChat reports 10/5 per reply
    assert all(isinstance(p["durationMs"], int) and p["durationMs"] >= 0 for p in ends)


def test_agent_tool_loop_runs_inside_the_node() -> None:
    events = run(job("research"))
    assert steps(events) == [("NODE_START", "planner"), ("NODE_END", "planner"),
                             ("NODE_START", "synth"), ("NODE_END", "synth"), ("COMPLETE", None)]
    assert [m for m, _ in fakes.CALLS] == ["gpt-4o", "gpt-4o", "claude-sonnet-5-5"]  # tool round + answer
    assert events[-1]["payload"]["tokens"] == 30  # tool chatter is not in shared state


def test_router_without_gate() -> None:
    events = run(job("support", "how do I reset my password?"))
    assert steps(events) == [("NODE_START", "faq"), ("NODE_END", "faq"), ("COMPLETE", None)]


def test_gate_approve_resumes_the_run() -> None:
    events = run(job("support", "I want a refund"), decisions=[True])
    s = steps(events)
    assert s[:3] == [("NODE_START", "gate"), ("GATE_PENDING", "gate"), ("GATE_RESOLVED", "gate")]
    pending = events[[e["type"] for e in events].index("GATE_PENDING")]
    assert pending["payload"]["prompt"].startswith("Review this escalation")
    assert pending["payload"]["lastOutput"] == "I want a refund"
    assert pending["payload"]["timeoutSeconds"] == 300
    assert s[-3:] == [("NODE_START", "escalation"), ("NODE_END", "escalation"), ("COMPLETE", None)]
    gate_end = next(e["payload"] for e in events if e["type"] == "NODE_END" and e["nodeId"] == "gate")
    assert (gate_end["inputTokens"], gate_end["outputTokens"]) == (0, 0)  # gates write no AI messages


def test_auto_approve_resolves_gates_without_asking() -> None:
    events = run({**job("support"), "input": {"query": "I want a refund", "autoApprove": True}})  # no decisions queued
    assert [e["payload"] for e in events if e["type"] == "GATE_RESOLVED"] == [{"decision": "approve"}]
    assert events[-1]["type"] == "COMPLETE"


@pytest.mark.parametrize(("decision", "label"), [(False, "reject"), (None, "timeout")])
def test_gate_reject_or_timeout_ends_the_run(decision: bool | None, label: str) -> None:
    events = run(job("support", "refund please"), decisions=[decision])
    resolved = next(e for e in events if e["type"] == "GATE_RESOLVED")
    assert resolved["payload"] == {"decision": label}
    assert events[-1]["type"] == "ERROR" and events[-1]["nodeId"] == "gate"
    assert "GateRejected" in events[-1]["payload"]["message"]


def test_parallel_gates_are_asked_one_at_a_time_and_resumed_together() -> None:
    events = run({"code": PARALLEL_GATES, "nodeIds": {"g1": "G1", "g2": "G2"}, "input": {}}, decisions=[True, True])
    pending = [e["nodeId"] for e in events if e["type"] == "GATE_PENDING"]
    assert sorted(pending) == ["G1", "G2"]
    assert events[-1]["type"] == "COMPLETE"


def test_rejecting_one_parallel_gate_ends_the_run_without_asking_the_other() -> None:
    events = run({"code": PARALLEL_GATES, "nodeIds": {"g1": "G1", "g2": "G2"}, "input": {}}, decisions=[False])
    assert [e["type"] for e in events].count("GATE_PENDING") == 1
    assert events[-1]["type"] == "ERROR" and "GateRejected" in events[-1]["payload"]["message"]


def test_parallel_failure_is_blamed_on_the_failing_branch() -> None:
    events = run({"code": PARALLEL_FAILURE, "nodeIds": {"slow": "SLOW", "bad": "BAD"}, "input": {}})
    assert events[-1]["type"] == "ERROR" and events[-1]["nodeId"] == "BAD"


def test_node_exception_is_reported_against_that_node() -> None:
    events = run({"code": FAILING_GRAPH, "nodeIds": {"boom": "n1"}, "input": {}})
    assert steps(events) == [("NODE_START", "n1"), ("ERROR", "n1")]
    assert events[-1]["payload"]["message"] == "ValueError: tool exploded"


def test_broken_code_is_an_error_not_a_crash() -> None:
    events = run({"code": "def (", "nodeIds": {}, "input": {}})
    assert events[-1]["type"] == "ERROR" and events[-1]["nodeId"] is None
    assert events[-1]["payload"]["message"].startswith("SyntaxError")
