"""Unit tests for the LLM layer: model fallback chain, retries, and errors.

The Gemini client is replaced with a deterministic fake, so no network
calls happen and no real API key is needed. ``asyncio.run`` drives the
coroutines because pytest-asyncio is not used in this project.
"""
from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace
from typing import Any

import pytest
from google.genai import errors as genai_errors
from pydantic import ValidationError

from app import llm
from app.config import Settings
from app.schemas import CoverLetterResponse

MODEL_A = "model-alpha"
MODEL_B = "model-beta"

OK_JSON = json.dumps({"cover_letter": "Dear Hiring Manager, I would love to join."})
BAD_JSON = "this is not valid json"


class FakeAsyncModels:
    """Deterministic stand-in for the google-genai async models resource.

    ``behavior`` maps a model id to what that model should do:

    * an ``int`` -> raise a Gemini ``APIError`` with that HTTP status
    * ``"hang"`` -> sleep well past the call timeout
    * any other string -> return it as the raw response text
    """

    def __init__(self, behavior: dict[str, Any]) -> None:
        self.behavior = behavior
        self.calls: list[str] = []

    async def generate_content(
        self, *, model: str, contents: str, config: Any
    ) -> SimpleNamespace:
        """Record the model name and act out the scripted behaviour.

        A callable behaviour receives ``(model, config)`` so tests can
        branch on what was actually sent (e.g. ``config.thinking_config``).
        """
        del contents  # unused by the tests
        self.calls.append(model)
        action = self.behavior[model]
        if callable(action):
            return action(model, config)
        if isinstance(action, int):
            raise genai_errors.APIError(
                action,
                {
                    "error": {
                        "code": action,
                        "message": "synthetic failure",
                        "status": "UNAVAILABLE",
                    }
                },
            )
        if action == "hang":
            await asyncio.sleep(60)
        return SimpleNamespace(text=action)


@pytest.fixture
def fake_llm(monkeypatch: pytest.MonkeyPatch) -> Any:
    """Patch the LLM module to hit a fake client with instant retries."""

    def setup(
        behavior: dict[str, Any], chain: list[str] | None = None
    ) -> FakeAsyncModels:
        fake_models = FakeAsyncModels(behavior)
        client = SimpleNamespace(aio=SimpleNamespace(models=fake_models))
        monkeypatch.setattr(llm, "_get_client", lambda: client)
        monkeypatch.setattr(
            llm,
            "get_settings",
            lambda: SimpleNamespace(gemini_models=chain or list(behavior)),
        )
        monkeypatch.setattr(llm, "BACKOFF_BASE_SECONDS", 0.0)
        monkeypatch.setattr(llm, "RATE_LIMIT_BASE_SECONDS", 0.0)
        return fake_models

    return setup


def _call() -> CoverLetterResponse:
    """Run one structured LLM call against the fake client."""
    result = asyncio.run(
        llm._generate_structured("system prompt", "user contents", CoverLetterResponse)
    )
    assert isinstance(result, CoverLetterResponse)
    return result


# --- config: model chain parsing -------------------------------------------


def test_gemini_models_parses_comma_separated_chain() -> None:
    """GEMINI_MODEL accepts a comma-separated, whitespace-tolerant chain."""
    settings = Settings(gemini_api_key="k", gemini_model=f"{MODEL_A}, {MODEL_B} ,")
    assert settings.gemini_models == [MODEL_A, MODEL_B]


def test_gemini_models_single_value_still_works() -> None:
    """A plain single-model GEMINI_MODEL keeps working (backward compatible)."""
    settings = Settings(gemini_api_key="k", gemini_model=MODEL_A)
    assert settings.gemini_models == [MODEL_A]


def test_settings_rejects_empty_model_chain() -> None:
    """A GEMINI_MODEL with no usable name fails fast at startup."""
    with pytest.raises(ValidationError, match="at least one model"):
        Settings(gemini_api_key="k", gemini_model=" , ")


# --- llm: fallback chain and retries ---------------------------------------


def test_falls_back_to_next_model_on_503(fake_llm: Any) -> None:
    """A capacity error on model 1 is answered by model 2, not a 502."""
    fake = fake_llm({MODEL_A: 503, MODEL_B: OK_JSON})
    result = _call()
    assert result.cover_letter.startswith("Dear Hiring Manager")
    assert fake.calls == [MODEL_A, MODEL_B]


def test_rotates_back_to_first_model_on_third_attempt(fake_llm: Any) -> None:
    """Attempts cycle through the chain: A, B, A; the final error lists all."""
    fake = fake_llm({MODEL_A: 503, MODEL_B: 503})
    with pytest.raises(llm.LLMError) as excinfo:
        _call()
    assert type(excinfo.value) is llm.LLMError
    message = str(excinfo.value)
    assert message.startswith("All LLM attempts failed: attempt 1:")
    assert "attempt 3" in message
    assert "HTTP 503" in message
    assert MODEL_A in message
    assert fake.calls == [MODEL_A, MODEL_B, MODEL_A]


def test_404_rotates_to_next_model(fake_llm: Any) -> None:
    """An unusable model (404) advances the chain instead of failing fast."""
    fake = fake_llm({MODEL_A: 404, MODEL_B: OK_JSON})
    result = _call()
    assert result.cover_letter
    assert fake.calls == [MODEL_A, MODEL_B]


def test_404_with_single_model_fails_immediately(fake_llm: Any) -> None:
    """With no fallback configured, a 404 raises right away with a hint."""
    fake = fake_llm({MODEL_A: 404}, chain=[MODEL_A])
    with pytest.raises(llm.LLMError) as excinfo:
        _call()
    assert fake.calls == [MODEL_A]  # no pointless retries
    assert "GEMINI_MODEL" in str(excinfo.value)  # setup hint present


def test_400_retries_same_model_without_thinking_config(fake_llm: Any) -> None:
    """A model that rejects thinking_config is re-called without it.

    The degraded re-call does not consume a retry attempt, so models like
    ``gemini-flash-lite-latest`` stay usable as chain fallbacks.
    """

    def behavior(model: str, config: Any) -> SimpleNamespace:
        del model
        if config.thinking_config is not None:
            raise genai_errors.APIError(
                400,
                {"error": {"code": 400, "message": "Request contains an invalid argument."}},
            )
        return SimpleNamespace(text=OK_JSON)

    fake = fake_llm({MODEL_A: behavior})
    result = _call()
    assert result.cover_letter.startswith("Dear Hiring Manager")
    assert fake.calls == [MODEL_A, MODEL_A]  # same attempt, second call


def test_400_on_both_configs_fails_with_hint(fake_llm: Any) -> None:
    """A genuine 400 (not thinking-related) still fails fast with a hint."""
    fake = fake_llm({MODEL_A: 400, MODEL_B: OK_JSON}, chain=[MODEL_A, MODEL_B])
    with pytest.raises(llm.LLMError) as excinfo:
        _call()
    message = str(excinfo.value)
    assert "HTTP 400" in message
    assert "GEMINI_MODEL" in message  # setup hint present
    assert fake.calls == [MODEL_A, MODEL_A]  # full config, then degraded, then stop


def test_rate_limits_back_off_longer_than_other_errors(
    fake_llm, monkeypatch
) -> None:
    """429s wait 5s/10s while other transient errors wait 2s/4s."""
    delays: list[float] = []

    async def record_sleep(delay: float) -> None:
        delays.append(delay)

    def use_real_backoff() -> None:
        # the fixture zeroes these; restore real values after each setup call
        monkeypatch.setattr(llm, "BACKOFF_BASE_SECONDS", 2.0)
        monkeypatch.setattr(llm, "RATE_LIMIT_BASE_SECONDS", 5.0)
        monkeypatch.setattr(llm.asyncio, "sleep", record_sleep)

    fake_llm({MODEL_A: 429, MODEL_B: 429})
    use_real_backoff()
    with pytest.raises(llm.LLMError):
        _call()
    assert delays == [5.0, 10.0]

    delays.clear()
    fake_llm({MODEL_A: 503, MODEL_B: 503})
    use_real_backoff()
    with pytest.raises(llm.LLMError):
        _call()
    assert delays == [2.0, 4.0]


def test_timeout_retries_then_raises_llm_timeout(fake_llm, monkeypatch) -> None:
    """Every attempt timing out ends in LLMTimeoutError (maps to 504)."""
    monkeypatch.setattr(llm, "CALL_TIMEOUT_SECONDS", 0.05)
    fake = fake_llm({MODEL_A: "hang", MODEL_B: "hang"})
    with pytest.raises(llm.LLMTimeoutError):
        _call()
    assert fake.calls == [MODEL_A, MODEL_B, MODEL_A]


def test_invalid_json_rotates_and_recovers(fake_llm: Any) -> None:
    """Malformed output on one model is retried on the next model."""
    fake = fake_llm({MODEL_A: BAD_JSON, MODEL_B: OK_JSON})
    result = _call()
    assert result.cover_letter.startswith("Dear Hiring Manager")
    assert fake.calls == [MODEL_A, MODEL_B]
