"""Network-free stand-ins for the chat model classes that generated code imports.

`install()` registers fake `langchain_openai`, `langchain_anthropic`, … modules so a
generated graph runs without API keys. FakeChat is a real BaseChatModel, so LangGraph's
streaming callbacks fire exactly as they would for a provider.
"""

import sys
import types
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pydantic import ConfigDict

CALLS: list[tuple[str, list[BaseMessage]]] = []  # (model, messages it was sent) per LLM call
TOOL_ARGS = {"web_search": {"query": "q"}, "http_request": {"url": "https://example.com"}}


class FakeChat(BaseChatModel):
    model_config = ConfigDict(extra="allow")

    model: str = "fake"
    bound_tools: list[Any] = []

    def __init__(self, model: str | None = None, llm: dict[str, Any] | None = None, **_: Any) -> None:
        super().__init__(model=model or (llm or {}).get("repo_id", "fake"))

    @property
    def _llm_type(self) -> str:
        return "fake"

    def bind_tools(self, tools: Any, **_: Any) -> "FakeChat":  # type: ignore[override]
        return self.model_copy(update={"bound_tools": list(tools)})

    def _generate(self, messages: list[BaseMessage], stop: Any = None, run_manager: Any = None, **_: Any) -> ChatResult:
        CALLS.append((self.model, messages))
        # With tools bound: call every tool once, then answer on the next round.
        if self.bound_tools and not any(isinstance(m, ToolMessage) for m in messages):
            msg = AIMessage(content="", tool_calls=[
                {"name": t.name, "args": TOOL_ARGS.get(t.name, {}), "id": f"call_{i}"}
                for i, t in enumerate(self.bound_tools)
            ])
        else:
            msg = AIMessage(
                content=f"answer from {self.model}",
                usage_metadata={"input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
            )
        return ChatResult(generations=[ChatGeneration(message=msg)])


def install() -> None:
    for module, cls in [("langchain_openai", "ChatOpenAI"), ("langchain_anthropic", "ChatAnthropic"),
                        ("langchain_mistralai", "ChatMistralAI"), ("langchain_ollama", "ChatOllama")]:
        m = types.ModuleType(module)
        setattr(m, cls, FakeChat)
        sys.modules[module] = m
    hf = types.ModuleType("langchain_huggingface")
    hf.ChatHuggingFace = FakeChat  # type: ignore[attr-defined]
    hf.HuggingFaceEndpoint = lambda **kw: kw  # type: ignore[attr-defined]
    sys.modules["langchain_huggingface"] = hf
