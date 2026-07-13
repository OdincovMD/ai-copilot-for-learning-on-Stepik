from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    cors_allow_origins: list[str]
    max_current_step_markdown_chars: int
    max_previous_steps: int
    max_previous_step_markdown_chars: int
    max_comments: int
    max_comment_chars: int
    max_total_request_chars: int


def get_settings() -> Settings:
    return Settings(
        cors_allow_origins=parse_required_list_env("CORS_ALLOW_ORIGINS"),
        max_current_step_markdown_chars=parse_required_positive_int_env("MAX_CURRENT_STEP_MARKDOWN_CHARS"),
        max_previous_steps=parse_required_positive_int_env("MAX_PREVIOUS_STEPS"),
        max_previous_step_markdown_chars=parse_required_positive_int_env("MAX_PREVIOUS_STEP_MARKDOWN_CHARS"),
        max_comments=parse_required_positive_int_env("MAX_COMMENTS"),
        max_comment_chars=parse_required_positive_int_env("MAX_COMMENT_CHARS"),
        max_total_request_chars=parse_required_positive_int_env("MAX_TOTAL_REQUEST_CHARS"),
    )


def parse_required_list_env(name: str) -> list[str]:
    value = os.environ.get(name)
    if value is None or not value.strip():
        raise RuntimeError(f"{name} must be set")

    items = [item.strip() for item in value.split(",") if item.strip()]
    if not items:
        raise RuntimeError(f"{name} must contain at least one value")

    return items


def parse_required_positive_int_env(name: str) -> int:
    value = os.environ.get(name)
    if value is None or not value.strip():
        raise RuntimeError(f"{name} must be set")

    try:
        parsed = int(value)
    except ValueError as error:
        raise RuntimeError(f"{name} must be an integer") from error

    if parsed <= 0:
        raise RuntimeError(f"{name} must be greater than zero")

    return parsed
