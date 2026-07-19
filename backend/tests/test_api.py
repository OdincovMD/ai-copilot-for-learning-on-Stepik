from __future__ import annotations

import asyncio
import os
from dataclasses import replace
from typing import Any

import httpx
import pytest

os.environ.setdefault("CORS_ALLOW_ORIGINS", "*")
os.environ.setdefault("ANALYSIS_PROVIDER", "mock")
os.environ.setdefault("OPENAI_API_KEY", "")
os.environ.setdefault("OPENAI_MODEL", "gpt-5.2")
os.environ.setdefault("OPENAI_BASE_URL", "https://api.openai.com/v1")
os.environ.setdefault("OPENAI_TIMEOUT_SECONDS", "45")
os.environ.setdefault("GROQ_API_KEY", "")
os.environ.setdefault("GROQ_MODEL", "openai/gpt-oss-120b")
os.environ.setdefault("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
os.environ.setdefault("GROQ_TIMEOUT_SECONDS", "45")
os.environ.setdefault("OLLAMA_BASE_URL", "http://localhost:11434")
os.environ.setdefault("OLLAMA_MODEL", "qwen2.5:3b")
os.environ.setdefault("OLLAMA_TIMEOUT_SECONDS", "90")
os.environ.setdefault("MAX_CURRENT_STEP_MARKDOWN_CHARS", "12000")
os.environ.setdefault("MAX_PREVIOUS_STEPS", "5")
os.environ.setdefault("MAX_PREVIOUS_STEP_MARKDOWN_CHARS", "6000")
os.environ.setdefault("MAX_COMMENTS", "40")
os.environ.setdefault("MAX_COMMENT_CHARS", "1200")
os.environ.setdefault("MAX_TOTAL_REQUEST_CHARS", "32000")

from app.main import app
from app.providers import AnalysisProviderError, GroqAnalysisProvider, OllamaAnalysisProvider, OpenAIAnalysisProvider


async def make_request(method: str, path: str, json: dict | None = None) -> httpx.Response:
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        return await async_client.request(method, path, json=json)


def make_learning_request(kind: str = "choice", comments: list[str] | None = None) -> dict:
    return {
        "version": "learning-request-v1",
        "mode": "hint",
        "language": "ru",
        "instruction": "Дай подсказку без готового ответа.",
        "guardrails": {
            "noDirectAnswers": True,
            "noMultipleChoiceOptionLeak": True,
            "focusOnUnderstanding": True,
        },
        "input": {
            "currentStep": {
                "url": "https://stepik.org/lesson/100/step/2",
                "title": "Тестовый шаг",
                "markdown": "Выберите один вариант из списка",
                "metadata": {
                    "courseTitle": "Тестовый курс",
                    "lessonTitle": "Тестовый урок",
                    "stepTitle": "Тестовый шаг",
                },
                "task": {
                    "kind": kind,
                    "hasAnswerControls": kind in {"choice", "code"},
                    "hasChoiceOptions": kind == "choice",
                    "hasCodeEditor": kind == "code",
                    "answerOptionsCount": 4 if kind == "choice" else None,
                },
            },
            "previousSteps": [
                {
                    "url": "https://stepik.org/lesson/100/step/1",
                    "title": "Предыдущий шаг",
                    "markdown": "Материал предыдущего шага.",
                    "metadata": {
                        "courseTitle": "Тестовый курс",
                        "lessonTitle": "Тестовый урок",
                    },
                }
            ],
            "comments": comments if comments is not None else ["Комментарий про частую ошибку."],
            "commentThreadsCount": 1,
        },
        "expectedOutput": {
            "summary": "2-4 предложения.",
            "focusPoints": ["3-6 идей."],
            "commentInsights": ["2-5 выводов."],
            "selfCheck": ["3-5 вопросов."],
            "needsMoreContext": "Короткая пометка.",
        },
    }


def test_health_returns_ok() -> None:
    response = asyncio.run(make_request("GET", "/health"))

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "stepik-copilot-api",
    }


def test_analyze_step_accepts_learning_request() -> None:
    response = asyncio.run(make_request("POST", "/analyze-step", json=make_learning_request()))

    assert response.status_code == 200
    assert response.headers["X-Request-Id"]
    payload = response.json()
    assert payload["version"] == "learning-analysis-v1"
    assert payload["mode"] == "hint"
    assert payload["source"] == "backend-mock"
    assert payload["summary"]
    assert payload["focusPoints"]
    assert payload["selfCheck"]


def test_analyze_step_handles_empty_comments() -> None:
    response = asyncio.run(make_request("POST", "/analyze-step", json=make_learning_request(comments=[])))

    assert response.status_code == 200
    assert response.json()["commentInsights"] == [
        "Видимых комментариев нет, поэтому backend mock не делает выводов по обсуждению."
    ]


def test_choice_warning_does_not_include_direct_answer() -> None:
    response = asyncio.run(make_request("POST", "/analyze-step", json=make_learning_request(kind="choice")))

    assert response.status_code == 200
    serialized = str(response.json()).lower()
    assert "не выбирает вариант ответа" in serialized
    assert "правильный вариант:" not in serialized
    assert "ответ:" not in serialized


def test_code_warning_does_not_include_final_solution() -> None:
    response = asyncio.run(make_request("POST", "/analyze-step", json=make_learning_request(kind="code")))

    assert response.status_code == 200
    serialized = str(response.json()).lower()
    assert "не пишет финальное решение целиком" in serialized
    assert "финальный код" not in serialized
    assert "готовая программа" not in serialized


def test_rejects_too_large_current_step_markdown() -> None:
    request = make_learning_request()
    request["input"]["currentStep"]["markdown"] = "x" * 12001

    response = asyncio.run(make_request("POST", "/analyze-step", json=request))

    assert response.status_code == 413
    payload = response.json()
    assert payload["error"]["code"] == "payload_too_large"
    assert "currentStep.markdown is too large" in payload["error"]["message"]
    assert payload["error"]["requestId"] == response.headers["X-Request-Id"]


def test_rejects_too_many_previous_steps() -> None:
    request = make_learning_request()
    previous_step = request["input"]["previousSteps"][0]
    request["input"]["previousSteps"] = [previous_step for _ in range(6)]

    response = asyncio.run(make_request("POST", "/analyze-step", json=request))

    assert response.status_code == 413
    payload = response.json()
    assert payload["error"]["code"] == "payload_too_large"
    assert "previousSteps is too large" in payload["error"]["message"]
    assert payload["error"]["requestId"] == response.headers["X-Request-Id"]


def test_rejects_too_long_comment() -> None:
    request = make_learning_request(comments=["x" * 1201])

    response = asyncio.run(make_request("POST", "/analyze-step", json=request))

    assert response.status_code == 413
    payload = response.json()
    assert payload["error"]["code"] == "payload_too_large"
    assert "comments[0] is too large" in payload["error"]["message"]
    assert payload["error"]["requestId"] == response.headers["X-Request-Id"]


def test_validation_error_uses_api_error_shape() -> None:
    request = make_learning_request()
    del request["input"]

    response = asyncio.run(make_request("POST", "/analyze-step", json=request))

    assert response.status_code == 422
    payload = response.json()
    assert payload["error"]["code"] == "validation_error"
    assert payload["error"]["message"] == "Invalid request payload."
    assert payload["error"]["requestId"] == response.headers["X-Request-Id"]
    assert payload["error"]["details"]


def test_internal_error_uses_api_error_shape(monkeypatch) -> None:
    from app import main as main_module

    def raise_error(_settings):
        raise RuntimeError("mock failure")

    monkeypatch.setattr(main_module, "create_analysis_provider", raise_error)

    response = asyncio.run(make_request("POST", "/analyze-step", json=make_learning_request()))

    assert response.status_code == 500
    payload = response.json()
    assert payload["error"]["code"] == "internal_error"
    assert payload["error"]["message"] == "Internal backend error."
    assert payload["error"]["requestId"] == response.headers["X-Request-Id"]


def test_openai_provider_without_key_returns_config_error(monkeypatch) -> None:
    from app import main as main_module

    monkeypatch.setattr(
        main_module,
        "settings",
        replace(
            main_module.settings,
            analysis_provider="openai",
            openai_api_key=None,
            openai_model="gpt-5.2",
        ),
    )

    response = asyncio.run(make_request("POST", "/analyze-step", json=make_learning_request()))

    assert response.status_code == 500
    payload = response.json()
    assert payload["error"]["code"] == "provider_config_error"
    assert "OPENAI_API_KEY must be set" in payload["error"]["message"]
    assert payload["error"]["requestId"] == response.headers["X-Request-Id"]


def test_openai_provider_posts_responses_request_and_parses_structured_output(monkeypatch) -> None:
    from app import providers as providers_module
    from app import main as main_module

    captured: dict[str, Any] = {}

    class FakeAsyncClient:
        def __init__(self, timeout: int) -> None:
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, url: str, headers: dict[str, str], json: dict[str, Any]):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json

            return httpx.Response(
                200,
                json={
                    "output_text": (
                        '{"summary":"Кратко","focusPoints":["Идея"],'
                        '"commentInsights":["Комментарий"],"selfCheck":["Вопрос"],'
                        '"needsMoreContext":"Не нужен","warnings":["Без прямого ответа"]}'
                    )
                },
            )

    monkeypatch.setattr(providers_module.httpx, "AsyncClient", FakeAsyncClient)

    settings = replace(
        main_module.settings,
        analysis_provider="openai",
        openai_api_key="test-key",
        openai_model="test-model",
        openai_base_url="https://api.openai.example/v1",
        openai_timeout_seconds=12,
    )
    provider = OpenAIAnalysisProvider(settings)
    request = main_module.LearningRequest.model_validate(make_learning_request())

    analysis = asyncio.run(provider.analyze(request))

    assert analysis.source == "openai"
    assert analysis.mode == "hint"
    assert analysis.summary == "Кратко"
    assert captured["timeout"] == 12
    assert captured["url"] == "https://api.openai.example/v1/responses"
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert captured["json"]["model"] == "test-model"
    assert captured["json"]["text"]["format"]["type"] == "json_schema"
    assert captured["json"]["text"]["format"]["strict"] is True
    assert "learning-request-v1" in captured["json"]["input"][1]["content"][0]["text"]


def test_groq_provider_without_key_returns_config_error(monkeypatch) -> None:
    from app import main as main_module

    monkeypatch.setattr(
        main_module,
        "settings",
        replace(
            main_module.settings,
            analysis_provider="groq",
            groq_api_key=None,
            groq_model="openai/gpt-oss-120b",
        ),
    )

    response = asyncio.run(make_request("POST", "/analyze-step", json=make_learning_request()))

    assert response.status_code == 500
    payload = response.json()
    assert payload["error"]["code"] == "provider_config_error"
    assert "GROQ_API_KEY must be set" in payload["error"]["message"]
    assert payload["error"]["requestId"] == response.headers["X-Request-Id"]


def test_groq_provider_posts_chat_completion_request_and_parses_structured_output(monkeypatch) -> None:
    from app import providers as providers_module
    from app import main as main_module

    captured: dict[str, Any] = {}

    class FakeAsyncClient:
        def __init__(self, timeout: int) -> None:
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, url: str, headers: dict[str, str], json: dict[str, Any]):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json

            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "message": {
                                "content": (
                                    '{"summary":"Через API","focusPoints":["Идея"],'
                                    '"commentInsights":["Комментарий"],"selfCheck":["Вопрос"],'
                                    '"needsMoreContext":"Не нужен","warnings":["Без прямого ответа"]}'
                                )
                            }
                        }
                    ]
                },
            )

    monkeypatch.setattr(providers_module.httpx, "AsyncClient", FakeAsyncClient)

    settings = replace(
        main_module.settings,
        analysis_provider="groq",
        groq_api_key="test-key",
        groq_model="openai/gpt-oss-120b",
        groq_base_url="https://api.groq.example/openai/v1",
        groq_timeout_seconds=15,
    )
    provider = GroqAnalysisProvider(settings)
    request = main_module.LearningRequest.model_validate(make_learning_request())

    analysis = asyncio.run(provider.analyze(request))

    assert analysis.source == "groq"
    assert analysis.mode == "hint"
    assert analysis.summary == "Через API"
    assert captured["timeout"] == 15
    assert captured["url"] == "https://api.groq.example/openai/v1/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert captured["json"]["model"] == "openai/gpt-oss-120b"
    assert captured["json"]["messages"][0]["role"] == "system"
    assert "learning-request-v1" in captured["json"]["messages"][1]["content"]
    assert captured["json"]["response_format"]["type"] == "json_schema"
    assert captured["json"]["response_format"]["json_schema"]["strict"] is True


def test_ollama_provider_without_model_returns_config_error(monkeypatch) -> None:
    from app import main as main_module

    monkeypatch.setattr(
        main_module,
        "settings",
        replace(
            main_module.settings,
            analysis_provider="ollama",
            ollama_base_url="http://localhost:11434",
            ollama_model=None,
            ollama_timeout_seconds=90,
        ),
    )

    response = asyncio.run(make_request("POST", "/analyze-step", json=make_learning_request()))

    assert response.status_code == 500
    payload = response.json()
    assert payload["error"]["code"] == "provider_config_error"
    assert "OLLAMA_MODEL must be set" in payload["error"]["message"]
    assert payload["error"]["requestId"] == response.headers["X-Request-Id"]


def test_ollama_provider_posts_generate_request_and_parses_structured_output(monkeypatch) -> None:
    from app import providers as providers_module
    from app import main as main_module

    captured: dict[str, Any] = {}

    class FakeAsyncClient:
        def __init__(self, timeout: int) -> None:
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, url: str, json: dict[str, Any]):
            captured["url"] = url
            captured["json"] = json

            return httpx.Response(
                200,
                json={
                    "response": (
                        '{"summary":"Локально","focusPoints":["Идея"],'
                        '"commentInsights":["Комментарий"],"selfCheck":["Вопрос"],'
                        '"needsMoreContext":"Не нужен","warnings":["Без прямого ответа"]}'
                    )
                },
            )

    monkeypatch.setattr(providers_module.httpx, "AsyncClient", FakeAsyncClient)

    settings = replace(
        main_module.settings,
        analysis_provider="ollama",
        ollama_base_url="http://ollama.example:11434",
        ollama_model="qwen2.5:3b",
        ollama_timeout_seconds=7,
    )
    provider = OllamaAnalysisProvider(settings)
    request = main_module.LearningRequest.model_validate(make_learning_request())

    analysis = asyncio.run(provider.analyze(request))

    assert analysis.source == "ollama"
    assert analysis.mode == "hint"
    assert analysis.summary == "Локально"
    assert captured["timeout"] == 7
    assert captured["url"] == "http://ollama.example:11434/api/generate"
    assert captured["json"]["model"] == "qwen2.5:3b"
    assert captured["json"]["stream"] is False
    assert captured["json"]["format"]["type"] == "object"
    assert "learning-request-v1" in captured["json"]["prompt"]


def test_ollama_provider_http_error_raises_provider_error(monkeypatch) -> None:
    from app import providers as providers_module
    from app import main as main_module

    class FakeAsyncClient:
        def __init__(self, timeout: int) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, url: str, json: dict[str, Any]):
            return httpx.Response(500, json={"error": "model failed"})

    monkeypatch.setattr(providers_module.httpx, "AsyncClient", FakeAsyncClient)
    settings = replace(
        main_module.settings,
        analysis_provider="ollama",
        ollama_base_url="http://localhost:11434",
        ollama_model="qwen2.5:3b",
        ollama_timeout_seconds=90,
    )
    provider = OllamaAnalysisProvider(settings)
    request = main_module.LearningRequest.model_validate(make_learning_request())

    with pytest.raises(AnalysisProviderError, match="Ollama returned HTTP 500"):
        asyncio.run(provider.analyze(request))
