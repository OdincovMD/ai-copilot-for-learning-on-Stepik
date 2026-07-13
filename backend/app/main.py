from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .analysis import build_mock_learning_analysis
from .config import get_settings
from .models import LearningAnalysis, LearningRequest
from .validation import PayloadLimitError, validate_learning_request_limits


settings = get_settings()
app = FastAPI(title="Stepik Copilot API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "stepik-copilot-api",
    }


@app.post("/analyze-step", response_model=LearningAnalysis)
async def analyze_step(request: LearningRequest) -> LearningAnalysis:
    try:
        validate_learning_request_limits(request, settings)
    except PayloadLimitError as error:
        raise HTTPException(status_code=413, detail=str(error)) from error

    return build_mock_learning_analysis(request)
