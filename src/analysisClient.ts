import type { LearningAnalysis } from "./learningAnalysis";
import type { LearningRequest } from "./learningRequest";

const DEFAULT_BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const ANALYSIS_TIMEOUT_MS = parseAnalysisTimeoutMs(import.meta.env.VITE_ANALYSIS_TIMEOUT_MS);

type ApiErrorCode = "payload_too_large" | "validation_error" | "provider_config_error" | "provider_error" | "internal_error";

type ApiErrorPayload = {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    details?: unknown;
  };
};

export class AnalysisClientError extends Error {
  readonly code?: ApiErrorCode;
  readonly requestId?: string;
  readonly status?: number;
  readonly details?: unknown;

  constructor(
    message: string,
    options: {
      code?: ApiErrorCode;
      requestId?: string;
      status?: number;
      details?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "AnalysisClientError";
    this.code = options.code;
    this.requestId = options.requestId;
    this.status = options.status;
    this.details = options.details;
  }
}

export async function requestLearningAnalysis(
  request: LearningRequest,
  options: {
    backendUrl?: string;
    timeoutMs?: number;
  } = {},
): Promise<LearningAnalysis> {
  const backendUrl = options.backendUrl ?? DEFAULT_BACKEND_URL;
  const timeoutMs = options.timeoutMs ?? ANALYSIS_TIMEOUT_MS;
  if (!backendUrl) {
    throw new AnalysisClientError("Сервис анализа не настроен.");
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${backendUrl}/analyze-step`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      const apiError = await readApiErrorPayload(response);
      throw new AnalysisClientError(
        getUserFacingApiErrorMessage(apiError?.error.code),
        {
          code: apiError?.error.code,
          requestId: apiError?.error.requestId ?? response.headers.get("X-Request-Id") ?? undefined,
          status: response.status,
          details: apiError?.error.details,
        },
      );
    }

    const payload = await response.json();
    if (!isLearningAnalysis(payload)) {
      throw new AnalysisClientError("Backend вернул неожиданный формат ответа");
    }

    return payload;
  } catch (error) {
    if (error instanceof AnalysisClientError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AnalysisClientError(
        `Ответ не пришел за ${formatTimeoutSeconds(timeoutMs)} сек. Попробуйте повторить запрос.`,
      );
    }

    throw new AnalysisClientError("Сервис анализа недоступен. Попробуйте повторить позже.");
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function getUserFacingApiErrorMessage(code: ApiErrorCode | undefined): string {
  switch (code) {
    case "payload_too_large":
      return "Слишком много данных для анализа. Обновите страницу или попробуйте другой шаг.";
    case "validation_error":
      return "Не удалось подготовить данные шага для анализа.";
    case "provider_config_error":
      return "Сервис анализа временно не настроен.";
    case "provider_error":
      return "Сервис анализа временно не ответил.";
    case "internal_error":
      return "Сервис анализа временно недоступен.";
    case undefined:
      return "Сервис анализа вернул ошибку.";
  }
}

function parseAnalysisTimeoutMs(value: string | undefined): number {
  if (!value) {
    return 120_000;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 120_000;
  }

  return parsed;
}

function formatTimeoutSeconds(timeoutMs: number): string {
  return (timeoutMs / 1000).toLocaleString("ru-RU", {
    maximumFractionDigits: 1,
  });
}

function isLearningAnalysis(value: unknown): value is LearningAnalysis {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LearningAnalysis>;

  return candidate.version === "learning-analysis-v1"
    && isLearningMode(candidate.mode)
    && (
      candidate.source === "local-mock"
      || candidate.source === "backend-mock"
      || candidate.source === "openai"
      || candidate.source === "groq"
      || candidate.source === "ollama"
    )
    && typeof candidate.summary === "string"
    && Array.isArray(candidate.focusPoints)
    && Array.isArray(candidate.commentInsights)
    && Array.isArray(candidate.selfCheck)
    && typeof candidate.needsMoreContext === "string"
    && Array.isArray(candidate.warnings);
}

function isLearningMode(value: unknown): value is LearningAnalysis["mode"] {
  return value === "explain" || value === "hint" || value === "notes";
}

async function readApiErrorPayload(response: Response): Promise<ApiErrorPayload | undefined> {
  try {
    const payload = await response.json();

    return isApiErrorPayload(payload) ? payload : undefined;
  } catch {
    return undefined;
  }
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ApiErrorPayload>;
  const error = candidate.error;

  return Boolean(error)
    && typeof error === "object"
    && isApiErrorCode((error as ApiErrorPayload["error"]).code)
    && typeof (error as ApiErrorPayload["error"]).message === "string"
    && typeof (error as ApiErrorPayload["error"]).requestId === "string";
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return value === "payload_too_large"
    || value === "validation_error"
    || value === "provider_config_error"
    || value === "provider_error"
    || value === "internal_error";
}
