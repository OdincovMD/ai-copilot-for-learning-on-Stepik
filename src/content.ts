import { createSidebar, type SidebarState } from "./sidebar";
import { extractStepPayload } from "./stepPayload";

const LOG_PREFIX = "[Stepik Copilot DOM Prototype]";
const DEBOUNCE_MS = 500;
const RETRY_MS = 750;
const MAX_WAIT_MS = 20_000;
const MANUAL_REFRESH_DELAY_MS = 160;

let lastUrl = window.location.href;
let debounceTimer: number | undefined;
let retryTimer: number | undefined;
let pageStartedAt = Date.now();
let lastLoggedSignature: string | undefined;
let lastPayload: ReturnType<typeof extractStepPayload> | undefined;

const sidebar = createSidebar({
  onRefresh: () => {
    sidebar.setState({ status: "collecting", payload: lastPayload });
    window.setTimeout(() => collectAndPublishPayload({ force: true }), MANUAL_REFRESH_DELAY_MS);
  },
});

function collectAndPublishPayload(options: { force?: boolean } = {}): void {
  try {
    const payload = extractStepPayload(document);
    const signature = createPayloadSignature(payload);

    if (isTransientPayload(payload) && Date.now() - pageStartedAt < MAX_WAIT_MS) {
      scheduleRetry();
      return;
    }

    const nextState = createSidebarState(payload);
    const shouldPublish = options.force || signature !== lastLoggedSignature;

    lastPayload = payload;

    if (!shouldPublish) {
      return;
    }

    lastLoggedSignature = signature;
    sidebar.setState(nextState);
    console.log(LOG_PREFIX, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    sidebar.setState({ status: "error", message, payload: lastPayload });
    console.error(LOG_PREFIX, message, error);
  }
}

function schedulePayloadCollection(): void {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(collectAndPublishPayload, DEBOUNCE_MS);
}

function scheduleRetry(): void {
  window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(collectAndPublishPayload, RETRY_MS);
}

function watchClientSideNavigation(): void {
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      pageStartedAt = Date.now();
      lastLoggedSignature = undefined;
      sidebar.setState({ status: "collecting", payload: lastPayload });
      schedulePayloadCollection();
      return;
    }

    schedulePayloadCollection();
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

function createSidebarState(payload: ReturnType<typeof extractStepPayload>): SidebarState {
  if (payload.stepText.trim().length === 0 || isTransientPayload(payload)) {
    return { status: "empty", payload };
  }

  return { status: "ready", payload };
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

schedulePayloadCollection();
watchClientSideNavigation();
