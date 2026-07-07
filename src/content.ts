import { extractStepPayload } from "./stepPayload";

const LOG_PREFIX = "[Stepik Copilot DOM Prototype]";
const DEBOUNCE_MS = 500;
const RETRY_MS = 750;
const MAX_WAIT_MS = 20_000;

let lastUrl = window.location.href;
let debounceTimer: number | undefined;
let retryTimer: number | undefined;
let pageStartedAt = Date.now();
let lastLoggedSignature: string | undefined;

function logPayload(): void {
  const payload = extractStepPayload(document);
  const signature = createPayloadSignature(payload);

  if (isTransientPayload(payload) && Date.now() - pageStartedAt < MAX_WAIT_MS) {
    scheduleRetry();
    return;
  }

  if (signature === lastLoggedSignature) {
    return;
  }

  lastLoggedSignature = signature;
  console.log(LOG_PREFIX, payload);
}

function schedulePayloadLog(): void {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(logPayload, DEBOUNCE_MS);
}

function scheduleRetry(): void {
  window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(logPayload, RETRY_MS);
}

function watchClientSideNavigation(): void {
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      pageStartedAt = Date.now();
      lastLoggedSignature = undefined;
      schedulePayloadLog();
      return;
    }

    schedulePayloadLog();
  });

  observer.observe(document.documentElement, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });
}

function isTransientPayload(payload: ReturnType<typeof extractStepPayload>): boolean {
  const normalizedStepText = payload.stepText.toLowerCase().replace(/\.+$/, "").trim();

  return normalizedStepText === "" || normalizedStepText === "загрузка" || normalizedStepText === "loading";
}

function createPayloadSignature(payload: ReturnType<typeof extractStepPayload>): string {
  return JSON.stringify({
    url: payload.url,
    title: payload.title,
    stepText: payload.stepText.slice(0, 500),
    commentsCount: payload.comments.length,
    metadata: payload.metadata,
  });
}

schedulePayloadLog();
watchClientSideNavigation();
