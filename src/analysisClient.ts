import type { LearningAnalysis } from "./learningAnalysis";
import type { LearningRequest } from "./learningRequest";

const DEFAULT_BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const ANALYSIS_TIMEOUT_MS = 30_000;

export class AnalysisClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisClientError";
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
    throw new AnalysisClientError("Не задан VITE_BACKEND_URL для backend.");
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
      throw new AnalysisClientError(`Backend вернул HTTP ${response.status}`);
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
      throw new AnalysisClientError("Backend не ответил вовремя");
    }

    throw new AnalysisClientError("Backend недоступен. Проверьте, что FastAPI-сервис запущен на адресе из VITE_BACKEND_URL.");
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function isLearningAnalysis(value: unknown): value is LearningAnalysis {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LearningAnalysis>;

  return candidate.version === "learning-analysis-v1"
    && isLearningMode(candidate.mode)
    && (candidate.source === "local-mock" || candidate.source === "backend-mock")
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
