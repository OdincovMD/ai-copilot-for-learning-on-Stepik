from __future__ import annotations

import json
from abc import ABC, abstractmethod
from typing import Any

import httpx
from pydantic import ValidationError

from .analysis import build_mock_learning_analysis
from .config import Settings
from .models import LearningAnalysis, LearningRequest


class AnalysisProviderError(Exception):
    pass


class AnalysisProviderConfigError(AnalysisProviderError):
    pass


class AnalysisProvider(ABC):
    @abstractmethod
    async def analyze(self, request: LearningRequest) -> LearningAnalysis:
        pass


class MockAnalysisProvider(AnalysisProvider):
    async def analyze(self, request: LearningRequest) -> LearningAnalysis:
        return build_mock_learning_analysis(request)


class OpenAIAnalysisProvider(AnalysisProvider):
    def __init__(self, settings: Settings) -> None:
        if not settings.openai_api_key:
            raise AnalysisProviderConfigError("OPENAI_API_KEY must be set when ANALYSIS_PROVIDER=openai")

        if not settings.openai_model:
            raise AnalysisProviderConfigError("OPENAI_MODEL must be set when ANALYSIS_PROVIDER=openai")

        self.api_key = settings.openai_api_key
        self.model = settings.openai_model
        self.base_url = settings.openai_base_url
        self.timeout_seconds = settings.openai_timeout_seconds

    async def analyze(self, request: LearningRequest) -> LearningAnalysis:
        payload = {
            "model": self.model,
            "input": [
                {
                    "role": "system",
                    "content": [{"type": "input_text", "text": build_system_prompt()}],
                },
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": build_user_prompt(request)}],
                },
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "learning_analysis",
                    "strict": True,
                    "schema": learning_analysis_schema(),
                }
            },
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    f"{self.base_url}/responses",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
        except httpx.HTTPError as error:
            raise AnalysisProviderError("OpenAI request failed") from error

        if response.status_code >= 400:
            raise AnalysisProviderError(f"OpenAI returned HTTP {response.status_code}")

        try:
            content = extract_response_text(response.json())
            parsed = json.loads(content)
            parsed["version"] = "learning-analysis-v1"
            parsed["mode"] = request.mode
            parsed["source"] = "openai"
            return LearningAnalysis.model_validate(parsed)
        except (KeyError, TypeError, ValueError, ValidationError) as error:
            raise AnalysisProviderError("OpenAI returned invalid LearningAnalysis") from error


class OllamaAnalysisProvider(AnalysisProvider):
    def __init__(self, settings: Settings) -> None:
        if not settings.ollama_base_url:
            raise AnalysisProviderConfigError("OLLAMA_BASE_URL must be set when ANALYSIS_PROVIDER=ollama")

        if not settings.ollama_model:
            raise AnalysisProviderConfigError("OLLAMA_MODEL must be set when ANALYSIS_PROVIDER=ollama")

        if settings.ollama_timeout_seconds is None:
            raise AnalysisProviderConfigError("OLLAMA_TIMEOUT_SECONDS must be set when ANALYSIS_PROVIDER=ollama")

        self.base_url = settings.ollama_base_url.rstrip("/")
        self.model = settings.ollama_model
        self.timeout_seconds = settings.ollama_timeout_seconds

    async def analyze(self, request: LearningRequest) -> LearningAnalysis:
        payload = {
            "model": self.model,
            "prompt": build_ollama_prompt(request),
            "stream": False,
            "format": learning_analysis_schema(),
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(f"{self.base_url}/api/generate", json=payload)
        except httpx.HTTPError as error:
            raise AnalysisProviderError("Ollama request failed") from error

        if response.status_code >= 400:
            raise AnalysisProviderError(f"Ollama returned HTTP {response.status_code}")

        try:
            content = extract_ollama_response_text(response.json())
            parsed = json.loads(content)
            parsed["version"] = "learning-analysis-v1"
            parsed["mode"] = request.mode
            parsed["source"] = "ollama"
            return LearningAnalysis.model_validate(parsed)
        except (KeyError, TypeError, ValueError, ValidationError) as error:
            raise AnalysisProviderError("Ollama returned invalid LearningAnalysis") from error


def create_analysis_provider(settings: Settings) -> AnalysisProvider:
    if settings.analysis_provider == "mock":
        return MockAnalysisProvider()

    if settings.analysis_provider == "openai":
        return OpenAIAnalysisProvider(settings)

    if settings.analysis_provider == "ollama":
        return OllamaAnalysisProvider(settings)

    raise AnalysisProviderConfigError(f"Unsupported ANALYSIS_PROVIDER: {settings.analysis_provider}")


def build_system_prompt() -> str:
    return (
        "Ты Stepik Copilot для обучения. Отвечай только валидным JSON по схеме. "
        "Не выдавай прямые ответы на тесты, не выбирай варианты и не пиши финальное решение задачи за пользователя. "
        "Фокусируйся на понимании, подсказках, самопроверке и честной оценке нехватки контекста."
    )


def build_user_prompt(request: LearningRequest) -> str:
    return json.dumps(request.model_dump(mode="json"), ensure_ascii=False)


def build_ollama_prompt(request: LearningRequest) -> str:
    return (
        f"{build_system_prompt()}\n\n"
        "Верни только JSON object без markdown-разметки, комментариев вокруг JSON или поясняющего текста. "
        "Поля ответа: summary, focusPoints, commentInsights, selfCheck, needsMoreContext, warnings.\n\n"
        f"LearningRequest JSON:\n{build_user_prompt(request)}"
    )


def extract_response_text(response_payload: dict[str, Any]) -> str:
    if isinstance(response_payload.get("output_text"), str):
        return response_payload["output_text"]

    for output_item in response_payload.get("output", []):
        for content_item in output_item.get("content", []):
            if content_item.get("type") == "output_text" and isinstance(content_item.get("text"), str):
                return content_item["text"]

    raise KeyError("output_text")


def extract_ollama_response_text(response_payload: dict[str, Any]) -> str:
    response_text = response_payload.get("response")
    if isinstance(response_text, str):
        return response_text

    raise KeyError("response")


def learning_analysis_schema() -> dict[str, Any]:
    string_array = {
        "type": "array",
        "items": {"type": "string"},
    }

    return {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "summary",
            "focusPoints",
            "commentInsights",
            "selfCheck",
            "needsMoreContext",
            "warnings",
        ],
        "properties": {
            "summary": {"type": "string"},
            "focusPoints": string_array,
            "commentInsights": string_array,
            "selfCheck": string_array,
            "needsMoreContext": {"type": "string"},
            "warnings": string_array,
        },
    }
