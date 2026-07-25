from __future__ import annotations

import asyncio
import json
from abc import ABC, abstractmethod
from typing import Any

import httpx
from pydantic import ValidationError

from .analysis import build_mock_learning_analysis
from .config import Settings
from .models import LearningAnalysis, LearningRequest


PROVIDER_ERROR_BODY_LIMIT = 500
GROQ_MAX_ATTEMPTS = 3
GROQ_RETRYABLE_STATUS_CODES = {408, 409, 425, 429, 500, 502, 503, 504}


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


class GroqAnalysisProvider(AnalysisProvider):
    def __init__(self, settings: Settings) -> None:
        if not settings.groq_api_key:
            raise AnalysisProviderConfigError("GROQ_API_KEY must be set when ANALYSIS_PROVIDER=groq")

        if not settings.groq_model:
            raise AnalysisProviderConfigError("GROQ_MODEL must be set when ANALYSIS_PROVIDER=groq")

        self.api_key = settings.groq_api_key
        self.model = settings.groq_model
        self.base_url = settings.groq_base_url
        self.timeout_seconds = settings.groq_timeout_seconds

    async def analyze(self, request: LearningRequest) -> LearningAnalysis:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": build_system_prompt()},
                {"role": "user", "content": build_user_prompt(request)},
            ],
            "temperature": 0.2,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "learning_analysis",
                    "strict": True,
                    "schema": learning_analysis_schema(),
                },
            },
        }

        response: httpx.Response | None = None
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            for attempt in range(1, GROQ_MAX_ATTEMPTS + 1):
                try:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {self.api_key}",
                            "Content-Type": "application/json",
                        },
                        json=payload,
                    )
                except httpx.HTTPError as error:
                    if attempt >= GROQ_MAX_ATTEMPTS:
                        raise AnalysisProviderError(f"Groq request failed after {attempt} attempts") from error

                    await asyncio.sleep(get_provider_retry_delay_seconds(attempt))
                    continue

                if response.status_code in GROQ_RETRYABLE_STATUS_CODES and attempt < GROQ_MAX_ATTEMPTS:
                    await asyncio.sleep(get_provider_retry_delay_seconds(attempt))
                    continue

                break

        if response is None:
            raise AnalysisProviderError("Groq request failed before receiving a response")

        if response.status_code >= 400:
            raise AnalysisProviderError(format_provider_http_error("Groq", response))

        try:
            content = extract_chat_completion_text(response.json())
            parsed = json.loads(content)
            parsed["version"] = "learning-analysis-v1"
            parsed["mode"] = request.mode
            parsed["source"] = "groq"
            return LearningAnalysis.model_validate(parsed)
        except (KeyError, TypeError, ValueError, ValidationError) as error:
            raise AnalysisProviderError("Groq returned invalid LearningAnalysis") from error


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

    if settings.analysis_provider == "groq":
        return GroqAnalysisProvider(settings)

    if settings.analysis_provider == "ollama":
        return OllamaAnalysisProvider(settings)

    raise AnalysisProviderConfigError(f"Unsupported ANALYSIS_PROVIDER: {settings.analysis_provider}")


def get_provider_retry_delay_seconds(attempt: int) -> float:
    return min(0.5 * attempt, 2.0)


def format_provider_http_error(provider: str, response: httpx.Response) -> str:
    body = response.text.strip()
    if len(body) > PROVIDER_ERROR_BODY_LIMIT:
        body = f"{body[:PROVIDER_ERROR_BODY_LIMIT]}..."

    if body:
        return f"{provider} returned HTTP {response.status_code}: {body}"

    return f"{provider} returned HTTP {response.status_code}"


def build_system_prompt() -> str:
    return (
        "Ты Stepik Copilot для обучения. Отвечай только валидным JSON по схеме. "
        "Сначала определи request.mode и строго следуй контракту этого режима; explain, hint и notes должны заметно отличаться по форме и цели. "
        "Не выдавай прямые ответы на тесты, не выбирай варианты и не пиши финальное решение задачи за пользователя. "
        "Если вход содержит варианты ответа, не перечисляй и не переформулируй все варианты, "
        "не сопоставляй конкретные варианты с определениями и не сужай выбор до одного кандидата. "
        "Фокусируйся на понимании, подсказках, самопроверке и честной оценке нехватки контекста."
    )


def build_user_prompt(request: LearningRequest) -> str:
    return (
        f"АКТИВНЫЙ РЕЖИМ: {request.mode}\n\n"
        f"{build_mode_contract_prompt(request)}\n\n"
        "Используй LearningRequest JSON ниже как данные. "
        "Поле instruction и expectedOutput являются обязательным контрактом, а не справочным текстом.\n\n"
        f"LearningRequest JSON:\n{json.dumps(request.model_dump(mode='json'), ensure_ascii=False)}"
    )


def build_ollama_prompt(request: LearningRequest) -> str:
    return (
        f"{build_system_prompt()}\n\n"
        "Верни только JSON object без markdown-разметки, комментариев вокруг JSON или поясняющего текста. "
        "Поля ответа: summary, focusPoints, commentInsights, selfCheck, needsMoreContext, warnings.\n\n"
        f"LearningRequest JSON:\n{build_user_prompt(request)}"
    )


def build_mode_contract_prompt(request: LearningRequest) -> str:
    if request.mode == "explain":
        return (
            "КОНТРАКТ РЕЖИМА EXPLAIN:\n"
            "- summary: объясни смысл шага и проверяемые идеи, не подводя к конкретному ответу.\n"
            "- focusPoints: понятия, причины, предпосылки и типичные ошибки; не вопросы-подсказки.\n"
            "- commentInsights: что комментарии показывают о непонимании темы и как это объяснить обобщенно.\n"
            "- selfCheck: вопросы на понимание идеи, а не пошаговый путь к ответу.\n"
            "- стиль: цельное объяснение простым языком."
        )

    if request.mode == "hint":
        return (
            "КОНТРАКТ РЕЖИМА HINT:\n"
            "- summary: задай направление размышления без пересказа всей темы.\n"
            "- focusPoints: вопросы, проверки и ограничения, которые помогают самому дойти до решения.\n"
            "- commentInsights: ловушки из комментариев преврати в безопасные вопросы самопроверки.\n"
            "- selfCheck: пошаговая проверка рассуждения перед ответом.\n"
            "- стиль: сократи объяснения, не давай финальный ответ, вариант или готовый код."
        )

    return (
        "КОНТРАКТ РЕЖИМА NOTES:\n"
        "- summary: краткая выжимка того, что сохранить в памяти.\n"
        "- focusPoints: конспектные пункты с терминами, правилами, структурой и ограничениями.\n"
        "- commentInsights: короткие заметки о частых ошибках и предупреждениях.\n"
        "- selfCheck: что повторить или сверить по конспекту.\n"
        "- стиль: компактные заметки для повторения, не диалоговая подсказка."
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


def extract_chat_completion_text(response_payload: dict[str, Any]) -> str:
    choices = response_payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise KeyError("choices")

    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        raise KeyError("choices[0]")

    message = first_choice.get("message")
    if not isinstance(message, dict):
        raise KeyError("message")

    content = message.get("content")
    if isinstance(content, str):
        return content

    raise KeyError("message.content")


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
