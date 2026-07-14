from __future__ import annotations

import logging
import time
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .config import get_settings
from .errors import api_error_response
from .models import LearningAnalysis, LearningRequest
from .providers import AnalysisProviderConfigError, AnalysisProviderError, create_analysis_provider
from .validation import PayloadLimitError, validate_learning_request_limits


logger = logging.getLogger("stepik_copilot.api")
settings = get_settings()
app = FastAPI(title="Stepik Copilot API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_id_and_logging_middleware(request: Request, call_next) -> Response:
    request_id = request.headers.get("X-Request-Id") or uuid4().hex
    request.state.request_id = request_id
    started_at = time.perf_counter()

    response = await call_next(request)
    duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
    response.headers["X-Request-Id"] = request_id

    logger.info(
        "request completed method=%s path=%s status=%s request_id=%s duration_ms=%s",
        request.method,
        request.url.path,
        response.status_code,
        request_id,
        duration_ms,
    )

    return response


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, error: RequestValidationError) -> Response:
    request_id = get_request_id(request)

    return api_error_response(
        code="validation_error",
        message="Invalid request payload.",
        request_id=request_id,
        status_code=422,
        details=error.errors(),
    )


@app.exception_handler(Exception)
async def internal_error_handler(request: Request, error: Exception) -> Response:
    request_id = get_request_id(request)
    logger.exception("unhandled backend error request_id=%s", request_id)

    return api_error_response(
        code="internal_error",
        message="Internal backend error.",
        request_id=request_id,
        status_code=500,
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "stepik-copilot-api",
    }


@app.post("/analyze-step", response_model=LearningAnalysis)
async def analyze_step(request: Request, learning_request: LearningRequest) -> LearningAnalysis | Response:
    try:
        validate_learning_request_limits(learning_request, settings)
    except PayloadLimitError as error:
        return api_error_response(
            code="payload_too_large",
            message=str(error),
            request_id=get_request_id(request),
            status_code=413,
        )

    try:
        provider = create_analysis_provider(settings)
        return await provider.analyze(learning_request)
    except AnalysisProviderConfigError as error:
        return api_error_response(
            code="provider_config_error",
            message=str(error),
            request_id=get_request_id(request),
            status_code=500,
        )
    except AnalysisProviderError as error:
        return api_error_response(
            code="provider_error",
            message=str(error),
            request_id=get_request_id(request),
            status_code=502,
        )


def get_request_id(request: Request) -> str:
    request_id = getattr(request.state, "request_id", None)
    return request_id if isinstance(request_id, str) else uuid4().hex
