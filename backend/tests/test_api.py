from __future__ import annotations

import asyncio
import os

import httpx

os.environ.setdefault("CORS_ALLOW_ORIGINS", "*")

from app.main import app


async def make_request(method: str, path: str, json: dict | None = None) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
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
