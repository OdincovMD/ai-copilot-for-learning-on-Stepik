import type { ContextPack } from "./contextPack";
import type { LearningAnalysis } from "./learningAnalysis";
import type { LearningRequest } from "./learningRequest";
import type { StepPayload } from "./stepPayload";

export type LearningFeedbackReason = "useful" | "too_direct" | "missed_context" | "factual_error";

export type LearningFeedbackRecord = {
  id: string;
  createdAt: string;
  url: string;
  mode: LearningRequest["mode"];
  taskKind: StepPayload["context"]["task"]["kind"];
  answerOptionsCount?: number;
  source: LearningAnalysis["source"];
  requestSummary: {
    currentMarkdownLength: number;
    previousStepsCount: number;
    commentsCount: number;
  };
  request: LearningRequest;
  analysis: LearningAnalysis;
  feedbackReason: LearningFeedbackReason;
};

type BrowserStorageArea = {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

type ChromeStorageArea = {
  get: (key: string, callback: (items: Record<string, unknown>) => void) => void;
  set: (items: Record<string, unknown>, callback?: () => void) => void;
};

type ExtensionGlobals = typeof globalThis & {
  browser?: {
    storage?: {
      local?: BrowserStorageArea;
    };
  };
  chrome?: {
    runtime?: {
      lastError?: {
        message?: string;
      };
    };
    storage?: {
      local?: ChromeStorageArea;
    };
  };
};

export const LEARNING_FEEDBACK_STORAGE_KEY = "stepikCopilot.learningFeedback.v1";

const MAX_FEEDBACK_RECORDS = 50;

export async function saveLearningFeedback(recordInput: LearningFeedbackRecord): Promise<LearningFeedbackRecord[]> {
  const currentLog = await readLearningFeedbackLog();
  const nextLog = [
    recordInput,
    ...currentLog.filter((record) => record.id !== recordInput.id),
  ].slice(0, MAX_FEEDBACK_RECORDS);

  await writeLearningFeedbackLog(nextLog);

  return nextLog;
}

export async function readLearningFeedbackLog(): Promise<LearningFeedbackRecord[]> {
  const extensionStorage = getExtensionStorage();

  if (extensionStorage.type === "browser") {
    const items = await extensionStorage.area.get(LEARNING_FEEDBACK_STORAGE_KEY);
    return normalizeLearningFeedbackLog(items[LEARNING_FEEDBACK_STORAGE_KEY]);
  }

  if (extensionStorage.type === "chrome") {
    const items = await new Promise<Record<string, unknown>>((resolve) => {
      extensionStorage.area.get(LEARNING_FEEDBACK_STORAGE_KEY, (storedItems) => resolve(storedItems ?? {}));
    });
    return normalizeLearningFeedbackLog(items[LEARNING_FEEDBACK_STORAGE_KEY]);
  }

  return readLocalStorageFeedbackLog();
}

export function createLearningFeedbackRecord(
  payload: StepPayload,
  contextPack: ContextPack | undefined,
  request: LearningRequest,
  analysis: LearningAnalysis,
  reason: LearningFeedbackReason,
): LearningFeedbackRecord {
  const requestSummary = {
    currentMarkdownLength: request.input.currentStep.markdown.length,
    previousStepsCount: request.input.previousSteps.length,
    commentsCount: request.input.comments.length,
  };
  const identityPayload = {
    url: payload.url,
    mode: request.mode,
    taskKind: payload.context.task.kind,
    answerOptionsCount: payload.context.task.answerOptionsCount,
    source: analysis.source,
    requestSummary,
    analysis,
    previousStepsIncluded: contextPack?.stats.includedPreviousSteps ?? 0,
  };

  return {
    id: `lf_${hashString(JSON.stringify(identityPayload))}`,
    createdAt: new Date().toISOString(),
    url: payload.url,
    mode: request.mode,
    taskKind: payload.context.task.kind,
    answerOptionsCount: payload.context.task.answerOptionsCount,
    source: analysis.source,
    requestSummary,
    request,
    analysis,
    feedbackReason: reason,
  };
}

async function writeLearningFeedbackLog(log: LearningFeedbackRecord[]): Promise<void> {
  const extensionStorage = getExtensionStorage();
  const items = { [LEARNING_FEEDBACK_STORAGE_KEY]: log };

  if (extensionStorage.type === "browser") {
    await extensionStorage.area.set(items);
    return;
  }

  if (extensionStorage.type === "chrome") {
    await new Promise<void>((resolve, reject) => {
      extensionStorage.area.set(items, () => {
        const error = (globalThis as ExtensionGlobals).chrome?.runtime?.lastError;
        if (error) {
          reject(new Error(error.message ?? "Chrome storage write failed"));
          return;
        }

        resolve();
      });
    });
    return;
  }

  writeLocalStorageFeedbackLog(log);
}

function getExtensionStorage():
  | { type: "browser"; area: BrowserStorageArea }
  | { type: "chrome"; area: ChromeStorageArea }
  | { type: "none" } {
  const globals = globalThis as ExtensionGlobals;

  if (globals.browser?.storage?.local) {
    return { type: "browser", area: globals.browser.storage.local };
  }

  if (globals.chrome?.storage?.local) {
    return { type: "chrome", area: globals.chrome.storage.local };
  }

  return { type: "none" };
}

function readLocalStorageFeedbackLog(): LearningFeedbackRecord[] {
  try {
    const rawValue = globalThis.localStorage?.getItem(LEARNING_FEEDBACK_STORAGE_KEY);
    return normalizeLearningFeedbackLog(rawValue ? JSON.parse(rawValue) : undefined);
  } catch {
    return [];
  }
}

function writeLocalStorageFeedbackLog(log: LearningFeedbackRecord[]): void {
  try {
    globalThis.localStorage?.setItem(LEARNING_FEEDBACK_STORAGE_KEY, JSON.stringify(log));
  } catch {
    // Playwright can execute the content script on origins where localStorage is unavailable.
  }
}

function normalizeLearningFeedbackLog(value: unknown): LearningFeedbackRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isLearningFeedbackRecord).slice(0, MAX_FEEDBACK_RECORDS);
}

function isLearningFeedbackRecord(value: unknown): value is LearningFeedbackRecord {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.createdAt !== "string" || typeof value.url !== "string") {
    return false;
  }

  return isLearningFeedbackReason(value.feedbackReason)
    && typeof value.mode === "string"
    && typeof value.taskKind === "string"
    && typeof value.source === "string"
    && isRecord(value.requestSummary)
    && isRecord(value.request)
    && isRecord(value.analysis);
}

function isLearningFeedbackReason(value: unknown): value is LearningFeedbackReason {
  return value === "useful" || value === "too_direct" || value === "missed_context" || value === "factual_error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}
