import type { StepPayload } from "./stepPayload";

export type ContextPack = {
  currentStep: StepPayload;
  previousSteps: ContextStepSnapshot[];
  source: "visited-cache";
  limits: {
    maxPreviousSteps: number;
    maxCharacters: number;
  };
  stats: {
    totalVisitedInLesson: number;
    includedPreviousSteps: number;
    truncated: boolean;
  };
};

export type ContextStepSnapshot = {
  url: string;
  title?: string;
  stepText: string;
  stepMarkdown: string;
  metadata: StepPayload["metadata"];
  context: Pick<StepPayload["context"], "ids" | "task">;
  cachedAt: string;
};

export type StepCache = Record<string, ContextStepSnapshot>;

type ContextPackLimits = {
  maxPreviousSteps: number;
  maxCharacters: number;
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

export const CONTEXT_STORAGE_KEY = "stepikCopilot.stepCache.v1";

const DEFAULT_LIMITS: ContextPackLimits = {
  maxPreviousSteps: 5,
  maxCharacters: 12_000,
};

const MAX_STORED_STEPS = 80;

export async function cacheStepAndBuildContextPack(currentStep: StepPayload): Promise<ContextPack> {
  const cache = await readStepCache();
  const cacheKey = createStepCacheKey(currentStep);
  const nextCache = pruneStepCache({
    ...cache,
    [cacheKey]: createContextStepSnapshot(currentStep),
  });

  await writeStepCache(nextCache);

  return buildContextPackFromCache(currentStep, nextCache);
}

export function buildContextPackFromCache(
  currentStep: StepPayload,
  cache: StepCache,
  limits: ContextPackLimits = DEFAULT_LIMITS,
): ContextPack {
  const currentLessonId = currentStep.context.ids.lessonId;
  const currentStepPosition = parseStepPosition(currentStep.context.ids.stepPosition);
  const currentCacheKey = createStepCacheKey(currentStep);
  const sameLessonSteps = Object.entries(cache)
    .filter(([, snapshot]) => snapshot.context.ids.lessonId === currentLessonId)
    .filter(([, snapshot]) => Boolean(snapshot.context.ids.lessonId));

  const previousCandidates = sameLessonSteps
    .filter(([cacheKey, snapshot]) => {
      if (cacheKey === currentCacheKey || snapshot.url === currentStep.url) {
        return false;
      }

      const snapshotPosition = parseStepPosition(snapshot.context.ids.stepPosition);
      return currentStepPosition !== undefined && snapshotPosition !== undefined && snapshotPosition < currentStepPosition;
    })
    .map(([, snapshot]) => snapshot)
    .sort((left, right) => {
      return (parseStepPosition(right.context.ids.stepPosition) ?? 0) - (parseStepPosition(left.context.ids.stepPosition) ?? 0);
    });

  const { previousSteps, truncatedByCharacters } = applyContextLimits(previousCandidates, limits);
  const sortedPreviousSteps = previousSteps.sort((left, right) => {
    return (parseStepPosition(left.context.ids.stepPosition) ?? 0) - (parseStepPosition(right.context.ids.stepPosition) ?? 0);
  });

  return {
    currentStep,
    previousSteps: sortedPreviousSteps,
    source: "visited-cache",
    limits,
    stats: {
      totalVisitedInLesson: sameLessonSteps.length,
      includedPreviousSteps: sortedPreviousSteps.length,
      truncated: truncatedByCharacters || previousCandidates.length > sortedPreviousSteps.length,
    },
  };
}

export function createContextStepSnapshot(payload: StepPayload, cachedAt: string = new Date().toISOString()): ContextStepSnapshot {
  return {
    url: payload.url,
    title: payload.title,
    stepText: payload.stepText,
    stepMarkdown: payload.stepMarkdown,
    metadata: payload.metadata,
    context: {
      ids: payload.context.ids,
      task: payload.context.task,
    },
    cachedAt,
  };
}

export function createStepCacheKey(payload: StepPayload): string {
  const { lessonId, stepPosition, unitId } = payload.context.ids;

  if (lessonId && stepPosition) {
    return ["lesson", lessonId, "step", stepPosition, unitId].filter(Boolean).join(":");
  }

  return `url:${payload.url}`;
}

function applyContextLimits(
  candidates: ContextStepSnapshot[],
  limits: ContextPackLimits,
): { previousSteps: ContextStepSnapshot[]; truncatedByCharacters: boolean } {
  const previousSteps: ContextStepSnapshot[] = [];
  let usedCharacters = 0;
  let truncatedByCharacters = false;

  for (const candidate of candidates) {
    if (previousSteps.length >= limits.maxPreviousSteps) {
      break;
    }

    const candidateLength = candidate.stepMarkdown.length;
    const remainingCharacters = limits.maxCharacters - usedCharacters;

    if (remainingCharacters <= 0) {
      truncatedByCharacters = true;
      break;
    }

    if (candidateLength > remainingCharacters) {
      previousSteps.push(truncateSnapshot(candidate, remainingCharacters));
      truncatedByCharacters = true;
      break;
    }

    previousSteps.push(candidate);
    usedCharacters += candidateLength;
  }

  return { previousSteps, truncatedByCharacters };
}

function truncateSnapshot(snapshot: ContextStepSnapshot, maxCharacters: number): ContextStepSnapshot {
  const nextMarkdown = snapshot.stepMarkdown.slice(0, maxCharacters).trimEnd();
  const nextText = snapshot.stepText.slice(0, maxCharacters).trimEnd();

  return {
    ...snapshot,
    stepText: nextText,
    stepMarkdown: nextMarkdown,
  };
}

function pruneStepCache(cache: StepCache): StepCache {
  const entries = Object.entries(cache).sort(([, left], [, right]) => {
    return new Date(right.cachedAt).getTime() - new Date(left.cachedAt).getTime();
  });

  return Object.fromEntries(entries.slice(0, MAX_STORED_STEPS));
}

async function readStepCache(): Promise<StepCache> {
  const extensionStorage = getExtensionStorage();

  if (extensionStorage.type === "browser") {
    const items = await extensionStorage.area.get(CONTEXT_STORAGE_KEY);
    return normalizeStepCache(items[CONTEXT_STORAGE_KEY]);
  }

  if (extensionStorage.type === "chrome") {
    const items = await new Promise<Record<string, unknown>>((resolve) => {
      extensionStorage.area.get(CONTEXT_STORAGE_KEY, (storedItems) => resolve(storedItems ?? {}));
    });
    return normalizeStepCache(items[CONTEXT_STORAGE_KEY]);
  }

  return readLocalStorageCache();
}

async function writeStepCache(cache: StepCache): Promise<void> {
  const extensionStorage = getExtensionStorage();
  const items = { [CONTEXT_STORAGE_KEY]: cache };

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

  writeLocalStorageCache(cache);
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

function readLocalStorageCache(): StepCache {
  try {
    const rawValue = globalThis.localStorage?.getItem(CONTEXT_STORAGE_KEY);
    return normalizeStepCache(rawValue ? JSON.parse(rawValue) : undefined);
  } catch {
    return {};
  }
}

function writeLocalStorageCache(cache: StepCache): void {
  try {
    globalThis.localStorage?.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Playwright can execute the content script on origins where localStorage is unavailable.
  }
}

function normalizeStepCache(value: unknown): StepCache {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, ContextStepSnapshot] => {
      return typeof entry[0] === "string" && isContextStepSnapshot(entry[1]);
    }),
  );
}

function isContextStepSnapshot(value: unknown): value is ContextStepSnapshot {
  if (!isRecord(value) || typeof value.url !== "string" || typeof value.stepText !== "string" || typeof value.stepMarkdown !== "string") {
    return false;
  }

  if (!isRecord(value.metadata) || !isRecord(value.context) || typeof value.cachedAt !== "string") {
    return false;
  }

  const context = value.context;
  return isRecord(context.ids) && isRecord(context.task);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseStepPosition(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
