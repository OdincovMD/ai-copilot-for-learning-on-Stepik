from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    cors_allow_origins: list[str]


def get_settings() -> Settings:
    return Settings(
        cors_allow_origins=parse_required_list_env("CORS_ALLOW_ORIGINS"),
    )


def parse_required_list_env(name: str) -> list[str]:
    value = os.environ.get(name)
    if value is None or not value.strip():
        raise RuntimeError(f"{name} must be set")

    items = [item.strip() for item in value.split(",") if item.strip()]
    if not items:
        raise RuntimeError(f"{name} must contain at least one value")

    return items
