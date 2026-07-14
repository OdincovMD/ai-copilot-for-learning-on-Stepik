from __future__ import annotations

from typing import Any, Literal

from fastapi.responses import JSONResponse


ApiErrorCode = Literal[
    "payload_too_large",
    "validation_error",
    "provider_config_error",
    "provider_error",
    "internal_error",
]


def api_error_response(
    *,
    code: ApiErrorCode,
    message: str,
    request_id: str,
    status_code: int,
    details: Any | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "error": {
            "code": code,
            "message": message,
            "requestId": request_id,
        }
    }

    if details is not None:
        body["error"]["details"] = details

    return JSONResponse(
        status_code=status_code,
        content=body,
        headers={"X-Request-Id": request_id},
    )
