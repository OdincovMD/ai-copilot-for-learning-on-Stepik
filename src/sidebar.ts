import type { ContextPack } from "./contextPack";
import { AnalysisClientError, requestLearningAnalysis } from "./analysisClient";
import type { LearningAnalysis } from "./learningAnalysis";
import {
  clearLearningFeedbackLog,
  createLearningFeedbackRecord,
  readLearningFeedbackLog,
  saveLearningFeedback,
  type LearningFeedbackReason,
} from "./learningFeedback";
import {
  buildLearningRequest,
  DEFAULT_LEARNING_MODE,
  LEARNING_MODE_LABELS,
  type LearningMode,
  type LearningRequest,
} from "./learningRequest";
import type { StepPayload } from "./stepPayload";

type SidebarStateBase = {
  contextPack?: ContextPack;
};

export type SidebarState =
  | (SidebarStateBase & { status: "idle"; payload?: StepPayload })
  | (SidebarStateBase & { status: "collecting"; payload?: StepPayload })
  | (SidebarStateBase & { status: "ready"; payload: StepPayload })
  | (SidebarStateBase & { status: "empty"; payload?: StepPayload })
  | (SidebarStateBase & { status: "error"; message: string; payload?: StepPayload });

type SidebarController = {
  setState: (nextState: SidebarState) => void;
};

type SidebarOptions = {
  onRefresh: () => void;
};

type AnalysisState =
  | { status: "idle" }
  | { status: "analyzing" }
  | { status: "ready"; analysis: LearningAnalysis; feedback: FeedbackState }
  | { status: "error"; message: string };

type FeedbackState = {
  status: "idle" | "saving" | "saved" | "error";
  selectedReason?: LearningFeedbackReason;
};

type FeedbackHistoryState = {
  status: "idle" | "clearing" | "cleared" | "copying" | "copied" | "empty" | "error";
  recordsCount?: number;
};

const HOST_ID = "stepik-copilot-root";

export function createSidebar(options: SidebarOptions): SidebarController {
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.append(host);

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  const root = document.createElement("div");

  style.textContent = SIDEBAR_CSS;
  shadow.append(style, root);

  let isOpen = false;
  let state: SidebarState = { status: "idle" };
  let learningMode: LearningMode = DEFAULT_LEARNING_MODE;
  let analysisState: AnalysisState = { status: "idle" };
  let feedbackHistoryState: FeedbackHistoryState = { status: "idle" };
  let analysisRequestId = 0;

  function setState(nextState: SidebarState): void {
    state = nextState;
    analysisState = { status: "idle" };
    feedbackHistoryState = { status: "idle" };
    analysisRequestId += 1;
    render();
  }

  function render(): void {
    root.replaceChildren();

    const shell = createElement("div", "sc-shell");
    const trigger = createTriggerButton();
    const drawer = createDrawer();

    shell.append(trigger, drawer);
    root.append(shell);
  }

  function createTriggerButton(): HTMLButtonElement {
    const button = createElement("button", `sc-trigger ${isOpen ? "is-open" : ""}`) as HTMLButtonElement;
    button.type = "button";
    button.setAttribute("aria-label", isOpen ? "Закрыть Stepik Copilot" : "Открыть Stepik Copilot");
    button.setAttribute("title", isOpen ? "Закрыть Stepik Copilot" : "Открыть Stepik Copilot");
    button.addEventListener("click", () => {
      isOpen = !isOpen;
      render();
      if (isOpen && state.status === "idle") {
        options.onRefresh();
      }
    });

    const mark = createElement("span", "sc-trigger-mark");
    mark.textContent = "S";

    const arrow = createIcon(isOpen ? "close" : "chevron-left");
    button.append(mark, arrow);

    return button;
  }

  function createDrawer(): HTMLElement {
    const drawer = createElement("aside", `sc-drawer ${isOpen ? "is-open" : ""}`);
    drawer.setAttribute("aria-hidden", String(!isOpen));

    const header = createElement("header", "sc-header");
    const brandMark = createElement("div", "sc-brand-mark");
    brandMark.textContent = "S";

    const titleWrap = createElement("div", "sc-title-wrap");
    const title = createElement("div", "sc-title");
    title.textContent = "Stepik Copilot";
    const subtitle = createElement("div", "sc-subtitle");
    subtitle.textContent = getHeaderSubtitle(state);
    const status = createStatus();
    titleWrap.append(title, subtitle, status);

    const titleGroup = createElement("div", "sc-title-group");
    titleGroup.append(brandMark, titleWrap);

    const closeButton = createElement("button", "sc-icon-button") as HTMLButtonElement;
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Закрыть Stepik Copilot");
    closeButton.append(createIcon("close"));
    closeButton.addEventListener("click", () => {
      isOpen = false;
      render();
    });

    header.append(titleGroup, closeButton);

    const body = createElement("div", "sc-body");
    appendStateContent(body);

    const actions = createElement("div", "sc-actions");
    const refreshButton = createElement("button", "sc-refresh") as HTMLButtonElement;
    refreshButton.type = "button";
    refreshButton.disabled = state.status === "collecting";
    refreshButton.append(createIcon("refresh"), document.createTextNode("Обновить данные"));
    refreshButton.addEventListener("click", options.onRefresh);

    const copyFeedbackButton = createElement("button", "sc-copy-feedback") as HTMLButtonElement;
    copyFeedbackButton.type = "button";
    copyFeedbackButton.disabled = feedbackHistoryState.status === "clearing" || feedbackHistoryState.status === "copying";
    copyFeedbackButton.append(createIcon("copy"), document.createTextNode("Скопировать историю оценок"));
    copyFeedbackButton.addEventListener("click", () => {
      void copyFeedbackHistory();
    });

    const clearFeedbackButton = createElement("button", "sc-clear-feedback") as HTMLButtonElement;
    clearFeedbackButton.type = "button";
    clearFeedbackButton.disabled = feedbackHistoryState.status === "clearing" || feedbackHistoryState.status === "copying";
    clearFeedbackButton.append(createIcon("trash"), document.createTextNode("Очистить историю оценок"));
    clearFeedbackButton.addEventListener("click", () => {
      void clearFeedbackHistory();
    });

    actions.append(refreshButton, copyFeedbackButton, clearFeedbackButton);

    if (feedbackHistoryState.status !== "idle") {
      const feedbackHistoryStatus = createElement("div", `sc-action-status is-${feedbackHistoryState.status}`);
      feedbackHistoryStatus.textContent = getFeedbackHistoryStatusText(feedbackHistoryState);
      actions.append(feedbackHistoryStatus);
    }

    const footer = createElement("footer", "sc-footer");
    const version = createElement("span");
    version.textContent = "Stepik Copilot v0.1.0";
    const host = createElement("span");
    host.textContent = "stepik.org";
    footer.append(version, host);

    drawer.append(header, body, actions, footer);

    return drawer;
  }

  function createStatus(): HTMLElement {
    const status = createElement("div", `sc-status is-${state.status}`);
    status.append(createStatusIcon(), document.createTextNode(getStatusLabel(state)));

    return status;
  }

  function createStatusIcon(): SVGElement {
    if (state.status === "collecting") {
      return createIcon("spinner");
    }

    if (state.status === "error" || state.status === "empty") {
      return createIcon("warning");
    }

    return createIcon("check");
  }

  function appendStateContent(body: HTMLElement): void {
    if (state.status === "collecting") {
      body.append(createNotice("Собираю данные со страницы Stepik.", "Подождите пару секунд, пока страница закончит загрузку."));
      if (state.payload) {
        body.append(createPayloadSections(state.payload));
      }
      return;
    }

    if (state.status === "error") {
      body.append(createNotice("Не удалось собрать данные.", state.message));
      if (state.payload) {
        body.append(createPayloadSections(state.payload));
      }
      return;
    }

    const payload = state.payload;

    if (state.status === "empty" || !payload) {
      body.append(createNotice("Текст шага не найден.", "Откройте страницу шага Stepik и нажмите «Обновить данные»."));
      return;
    }

    body.append(createPayloadSections(payload));
  }

  function createPayloadSections(payload: StepPayload): DocumentFragment {
    const fragment = document.createDocumentFragment();

    fragment.append(
      createOverview(payload, state.contextPack),
      createLearningAnalysisView(payload, state.contextPack),
      createSection("Контекст", createContextView(payload, state.contextPack)),
    );

    return fragment;
  }

  render();

  return {
    setState,
  };

  function setLearningMode(nextMode: LearningMode): void {
    learningMode = nextMode;
    analysisState = { status: "idle" };
    analysisRequestId += 1;
    render();
  }

  async function clearFeedbackHistory(): Promise<void> {
    feedbackHistoryState = { status: "clearing" };
    render();

    try {
      await clearLearningFeedbackLog();
      feedbackHistoryState = { status: "cleared" };
    } catch {
      feedbackHistoryState = { status: "error" };
    }

    render();
  }

  async function copyFeedbackHistory(): Promise<void> {
    feedbackHistoryState = { status: "copying" };
    render();

    try {
      const feedbackLog = await readLearningFeedbackLog();
      if (feedbackLog.length === 0) {
        feedbackHistoryState = { status: "empty" };
      } else {
        await copyTextToClipboard(JSON.stringify(feedbackLog, null, 2));
        feedbackHistoryState = { status: "copied", recordsCount: feedbackLog.length };
      }
    } catch {
      feedbackHistoryState = { status: "error" };
    }

    render();
  }

  async function generateLearningAnalysis(request: LearningRequest): Promise<void> {
    const requestId = analysisRequestId + 1;
    analysisRequestId = requestId;
    analysisState = { status: "analyzing" };
    render();

    try {
      const analysis = await requestLearningAnalysis(request);
      if (requestId !== analysisRequestId) {
        return;
      }

      analysisState = { status: "ready", analysis, feedback: createEmptyFeedbackState() };
    } catch (error) {
      if (requestId !== analysisRequestId) {
        return;
      }

      analysisState = {
        status: "error",
        message: getAnalysisErrorMessage(error),
      };
    }

    render();
  }

  async function submitLearningFeedback(
    payload: StepPayload,
    contextPack: ContextPack | undefined,
    request: LearningRequest,
    analysis: LearningAnalysis,
    reason: LearningFeedbackReason,
  ): Promise<void> {
    if (analysisState.status !== "ready" || analysisState.analysis !== analysis) {
      return;
    }

    const record = createLearningFeedbackRecord(payload, contextPack, request, analysis, reason);
    analysisState = {
      status: "ready",
      analysis,
      feedback: {
        status: "saving",
        selectedReason: reason,
      },
    };
    render();

    try {
      await saveLearningFeedback(record);
      if (analysisState.status !== "ready" || analysisState.analysis !== analysis) {
        return;
      }

      analysisState = {
        status: "ready",
        analysis,
        feedback: {
          status: "saved",
          selectedReason: reason,
        },
      };
    } catch {
      if (analysisState.status !== "ready" || analysisState.analysis !== analysis) {
        return;
      }

      analysisState = {
        status: "ready",
        analysis,
        feedback: {
          status: "error",
          selectedReason: reason,
        },
      };
    }

    render();
  }

  function createLearningModeSwitcher(): HTMLElement {
    const wrapper = createElement("div", "sc-mode");
    const label = createElement("div", "sc-mode-label");
    label.textContent = "Режим помощи";
    const switcher = createElement("div", "sc-mode-switcher");
    (Object.keys(LEARNING_MODE_LABELS) as LearningMode[]).forEach((mode) => {
      const button = createElement("button", `sc-mode-button ${mode === learningMode ? "is-active" : ""}`) as HTMLButtonElement;
      button.type = "button";
      button.textContent = LEARNING_MODE_LABELS[mode];
      button.setAttribute("aria-pressed", String(mode === learningMode));
      button.addEventListener("click", () => setLearningMode(mode));
      switcher.append(button);
    });

    wrapper.append(label, switcher);

    return wrapper;
  }

  function createLearningAnalysisView(payload: StepPayload, contextPack: ContextPack | undefined): HTMLElement {
    const request = buildLearningRequest(payload, contextPack, learningMode);
    const wrapper = createElement("section", "sc-analysis");
    const header = createElement("div", "sc-analysis-header");
    const title = createElement("h2", "sc-section-title");
    title.textContent = "Ответ Copilot";
    const summary = createElement("p", "sc-analysis-summary");
    summary.textContent = getAnalysisSummaryText(analysisState, learningMode);
    header.append(title, summary);

    const generateButton = createElement("button", "sc-generate-analysis") as HTMLButtonElement;
    generateButton.type = "button";
    generateButton.disabled = analysisState.status === "analyzing";
    generateButton.append(createIcon("sparkle"), document.createTextNode(getGenerateAnalysisButtonLabel(analysisState, learningMode)));
    generateButton.addEventListener("click", () => generateLearningAnalysis(request));

    wrapper.append(header, createLearningModeSwitcher(), createRequestDisclosure(request), generateButton);

    if (analysisState.status === "ready") {
      wrapper.append(
        createAnalysisResult(analysisState.analysis),
        createLearningFeedbackPanel({
          payload,
          contextPack,
          request,
          analysis: analysisState.analysis,
          feedback: analysisState.feedback,
          onSelect: submitLearningFeedback,
        }),
      );
      return wrapper;
    }

    if (analysisState.status === "error") {
      wrapper.append(createAnalysisErrorState(analysisState.message));
      return wrapper;
    }

    wrapper.append(createModeAwareAnalysisEmptyState(analysisState.status, learningMode));

    return wrapper;
  }
}

function createEmptyFeedbackState(): FeedbackState {
  return {
    status: "idle",
  };
}

function createContextView(payload: StepPayload, contextPack: ContextPack | undefined): HTMLElement {
  const wrapper = createElement("div", "sc-context");
  wrapper.append(createContextList(payload, contextPack));

  if (contextPack) {
    wrapper.append(createPreviousStepsView(contextPack));
  }

  return wrapper;
}

function createOverview(payload: StepPayload, contextPack: ContextPack | undefined): HTMLElement {
  const overview = createElement("section", "sc-overview");
  const intro = createElement("div", "sc-overview-intro");
  const title = createElement("div", "sc-overview-title");
  title.textContent = getOverviewTitle(payload, contextPack);
  const description = createElement("p", "sc-overview-text");
  description.textContent = getOverviewDescription(payload, contextPack);
  intro.append(title, description);

  const metrics = createElement("div", "sc-metrics");
  metrics.append(
    createMetric("Контекст", `${contextPack?.stats.includedPreviousSteps ?? 0}`, "пред. шагов"),
    createMetric("Комментарии", `${payload.comments.length}`, payload.commentThreads.length > 0 ? "в тредах" : "видимых"),
    createMetric("Markdown", formatCompactNumber(payload.stepMarkdown.length), "символов"),
  );

  overview.append(intro, metrics);

  return overview;
}

function createMetric(labelText: string, valueText: string, captionText: string): HTMLElement {
  const metric = createElement("div", "sc-metric");
  const label = createElement("div", "sc-metric-label");
  label.textContent = labelText;
  const value = createElement("div", "sc-metric-value");
  value.textContent = valueText;
  const caption = createElement("div", "sc-metric-caption");
  caption.textContent = captionText;
  metric.append(label, value, caption);

  return metric;
}

function createAnalysisEmptyState(status: "idle" | "analyzing"): HTMLElement {
  return createModeAwareAnalysisEmptyState(status, DEFAULT_LEARNING_MODE);
}

function createModeAwareAnalysisEmptyState(status: "idle" | "analyzing", mode: LearningMode): HTMLElement {
  const copy = getAnalysisModeCopy(mode);
  const empty = createElement("div", "sc-analysis-empty");
  const title = createElement("div", "sc-analysis-empty-title");
  title.textContent = status === "analyzing" ? copy.analyzingTitle : copy.emptyTitle;
  const text = createElement("p", "sc-analysis-empty-text");
  text.textContent = status === "analyzing" ? copy.analyzingText : copy.emptyText;
  empty.append(title, text);

  return empty;
}

function createAnalysisErrorState(message: string): HTMLElement {
  const error = createElement("div", "sc-analysis-empty is-error");
  const title = createElement("div", "sc-analysis-empty-title");
  title.textContent = "Не удалось получить ответ";
  const text = createElement("p", "sc-analysis-empty-text");
  text.textContent = message;
  error.append(title, text);

  return error;
}

function createRequestDisclosure(request: LearningRequest): HTMLElement {
  const disclosure = createElement("div", "sc-request-disclosure");
  const label = createElement("div", "sc-request-disclosure-label");
  label.textContent = "Перед отправкой";
  const text = createElement("p", "sc-request-disclosure-text");
  text.textContent = [
    "На анализ уйдут: текст текущего шага",
    formatCommentsForDisclosure(request.input.comments.length),
    formatPreviousStepsForDisclosure(request.input.previousSteps.length),
  ].join(", ") + ".";
  disclosure.append(label, text);

  return disclosure;
}

function getAnalysisSummaryText(state: AnalysisState, mode: LearningMode = DEFAULT_LEARNING_MODE): string {
  switch (state.status) {
    case "analyzing":
      return getAnalysisModeCopy(mode).analyzingSummary;
    case "ready":
      return getReadyAnalysisSummaryText(state.analysis.source, state.analysis.mode);
    case "error":
      return "Запрос не завершился. Можно попробовать еще раз.";
    case "idle":
      return getAnalysisModeCopy(mode).idleSummary;
  }
}

function getReadyAnalysisSummaryText(source: LearningAnalysis["source"], mode: LearningMode): string {
  const readyText = getAnalysisModeCopy(mode).readySummary;

  if (source === "ollama") {
    return `${readyText} Данные обработаны локальной моделью.`;
  }

  if (source === "openai") {
    return `${readyText} Ключи остаются на сервере.`;
  }

  if (source === "groq") {
    return `${readyText} Ключи остаются на сервере.`;
  }

  return `${readyText} Preview готов.`;
}

function getGenerateAnalysisButtonLabel(state: AnalysisState, mode: LearningMode = DEFAULT_LEARNING_MODE): string {
  const copy = getAnalysisModeCopy(mode);

  switch (state.status) {
    case "analyzing":
      return copy.analyzingButton;
    case "ready":
      return copy.refreshButton;
    case "error":
      return copy.retryButton;
    case "idle":
      return copy.generateButton;
  }
}

function getAnalysisErrorMessage(error: unknown): string {
  if (error instanceof AnalysisClientError) {
    return error.requestId ? `${error.message} Request ID: ${error.requestId}` : error.message;
  }

  return "Непредвиденная ошибка при запросе анализа.";
}

function createAnalysisResult(analysis: LearningAnalysis): HTMLElement {
  const copy = getAnalysisModeCopy(analysis.mode);
  const result = createElement("div", "sc-analysis-result");
  result.append(
    createAnalysisSummary(analysis, copy.summaryTitle),
    createAnalysisList(copy.focusTitle, analysis.focusPoints),
    createAnalysisList(copy.commentsTitle, analysis.commentInsights),
    createAnalysisList(copy.selfCheckTitle, analysis.selfCheck),
    createAnalysisNote(copy.contextTitle, analysis.needsMoreContext),
  );

  if (analysis.warnings.length > 0) {
    result.append(createAnalysisList("Ограничения", analysis.warnings, "warning"));
  }

  return result;
}

function createLearningFeedbackPanel(options: {
  payload: StepPayload;
  contextPack: ContextPack | undefined;
  request: LearningRequest;
  analysis: LearningAnalysis;
  feedback: FeedbackState;
  onSelect: (
    payload: StepPayload,
    contextPack: ContextPack | undefined,
    request: LearningRequest,
    analysis: LearningAnalysis,
    reason: LearningFeedbackReason,
  ) => Promise<void>;
}): HTMLElement {
  const panel = createElement("div", "sc-feedback");
  const title = createElement("div", "sc-feedback-title");
  title.textContent = "Оценить ответ";
  const hint = createElement("p", "sc-feedback-hint");
  hint.textContent = getFeedbackHint(options.feedback);
  const buttons = createElement("div", "sc-feedback-options");

  FEEDBACK_OPTIONS.forEach((option) => {
    const isSelected = options.feedback.selectedReason === option.reason;
    const button = createElement("button", `sc-feedback-button ${isSelected ? "is-selected" : ""}`) as HTMLButtonElement;
    button.type = "button";
    button.textContent = option.label;
    button.setAttribute("aria-pressed", String(isSelected));
    button.disabled = options.feedback.status === "saving";
    button.addEventListener("click", () => {
      void options.onSelect(options.payload, options.contextPack, options.request, options.analysis, option.reason);
    });
    buttons.append(button);
  });

  panel.append(title, hint, buttons);

  return panel;
}

const FEEDBACK_OPTIONS: Array<{ reason: LearningFeedbackReason; label: string }> = [
  { reason: "useful", label: "Полезно" },
  { reason: "too_direct", label: "Слишком прямой ответ" },
  { reason: "missed_context", label: "Не понял контекст" },
  { reason: "factual_error", label: "Фактическая ошибка" },
];

function getFeedbackHint(feedback: FeedbackState): string {
  if (feedback.status === "saving") {
    return "Сохраняю оценку.";
  }

  if (feedback.status === "saved") {
    return "Спасибо, оценка сохранена.";
  }

  if (feedback.status === "error") {
    return "Не удалось сохранить оценку.";
  }

  return "Помогите понять, насколько ответ был полезен.";
}

function getFeedbackHistoryStatusText(state: FeedbackHistoryState): string {
  if (state.status === "clearing") {
    return "Очищаю историю оценок.";
  }

  if (state.status === "copying") {
    return "Копирую историю оценок.";
  }

  if (state.status === "copied") {
    return `История оценок скопирована: ${formatFeedbackRecordsCount(state.recordsCount ?? 0)}.`;
  }

  if (state.status === "empty") {
    return "История оценок пока пустая.";
  }

  if (state.status === "cleared") {
    return "История оценок очищена.";
  }

  if (state.status === "error") {
    return "Не удалось очистить историю оценок.";
  }

  return "";
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard API is unavailable");
  }

  await navigator.clipboard.writeText(text);
}

function createAnalysisSummary(analysis: LearningAnalysis, titleText = "О чем шаг"): HTMLElement {
  const section = createElement("div", "sc-analysis-block is-summary");
  const title = createElement("div", "sc-analysis-block-title");
  title.textContent = titleText;
  const text = createElement("p", "sc-analysis-text");
  text.textContent = analysis.summary;
  section.append(title, text);

  return section;
}

type AnalysisModeCopy = {
  idleSummary: string;
  analyzingSummary: string;
  readySummary: string;
  emptyTitle: string;
  emptyText: string;
  analyzingTitle: string;
  analyzingText: string;
  generateButton: string;
  analyzingButton: string;
  refreshButton: string;
  retryButton: string;
  summaryTitle: string;
  focusTitle: string;
  commentsTitle: string;
  selfCheckTitle: string;
  contextTitle: string;
};

const ANALYSIS_MODE_COPY: Record<LearningMode, AnalysisModeCopy> = {
  explain: {
    idleSummary: "Получите объяснение идей шага без готового ответа.",
    analyzingSummary: "Готовлю объяснение по текущему шагу и видимым комментариям.",
    readySummary: "Объяснение готово.",
    emptyTitle: "Готов к объяснению",
    emptyText: "Нажмите кнопку, чтобы разобрать смысл шага, ключевые идеи и типичные ошибки.",
    analyzingTitle: "Готовлю объяснение",
    analyzingText: "Разбираю проверяемые идеи и места, где обычно путаются.",
    generateButton: "Получить объяснение",
    analyzingButton: "Объясняю",
    refreshButton: "Обновить объяснение",
    retryButton: "Повторить объяснение",
    summaryTitle: "Объяснение",
    focusTitle: "Ключевые идеи",
    commentsTitle: "Что обычно путают",
    selfCheckTitle: "Проверить понимание",
    contextTitle: "Контекст для объяснения",
  },
  hint: {
    idleSummary: "Получите подсказку без готового ответа на задание.",
    analyzingSummary: "Готовлю подсказку по текущему шагу и видимым комментариям.",
    readySummary: "Подсказка готова.",
    emptyTitle: "Готов к подсказке",
    emptyText: "Нажмите кнопку, чтобы получить направление, ограничения и проверку рассуждения.",
    analyzingTitle: "Готовлю подсказку",
    analyzingText: "Ищу безопасные вопросы и следующий шаг без спойлера.",
    generateButton: "Получить подсказку",
    analyzingButton: "Подсказываю",
    refreshButton: "Обновить подсказку",
    retryButton: "Повторить подсказку",
    summaryTitle: "Подсказка",
    focusTitle: "Куда смотреть",
    commentsTitle: "Ловушки",
    selfCheckTitle: "Проверка рассуждения",
    contextTitle: "Контекст для подсказки",
  },
  notes: {
    idleSummary: "Соберите конспект по текущему шагу и доступному контексту.",
    analyzingSummary: "Собираю конспект по текущему шагу и видимым комментариям.",
    readySummary: "Конспект готов.",
    emptyTitle: "Готов к конспекту",
    emptyText: "Нажмите кнопку, чтобы сохранить термины, правила и предупреждения для повторения.",
    analyzingTitle: "Собираю конспект",
    analyzingText: "Выделяю заметки, ограничения и частые ошибки.",
    generateButton: "Собрать конспект",
    analyzingButton: "Собираю",
    refreshButton: "Обновить конспект",
    retryButton: "Повторить конспект",
    summaryTitle: "Конспект",
    focusTitle: "Сохранить в заметки",
    commentsTitle: "Частые ошибки",
    selfCheckTitle: "Повторить",
    contextTitle: "Контекст для конспекта",
  },
};

function getAnalysisModeCopy(mode: LearningMode): AnalysisModeCopy {
  return ANALYSIS_MODE_COPY[mode];
}

function createAnalysisList(titleText: string, items: string[], variant: "default" | "warning" = "default"): HTMLElement {
  const section = createElement("div", `sc-analysis-block is-${variant}`);
  const title = createElement("div", "sc-analysis-block-title");
  title.textContent = titleText;
  const list = createElement("ul", "sc-analysis-list");
  items.forEach((itemText) => {
    const item = createElement("li");
    item.textContent = itemText;
    list.append(item);
  });
  section.append(title, list);

  return section;
}

function createAnalysisNote(titleText: string, bodyText: string): HTMLElement {
  const section = createElement("div", "sc-analysis-block is-note");
  const title = createElement("div", "sc-analysis-block-title");
  title.textContent = titleText;
  const text = createElement("p", "sc-analysis-text");
  text.textContent = bodyText;
  section.append(title, text);

  return section;
}

function getOverviewTitle(payload: StepPayload, contextPack: ContextPack | undefined): string {
  if (!payload.stepText.trim()) {
    return "Жду данные шага";
  }

  if ((contextPack?.stats.includedPreviousSteps ?? 0) > 0) {
    return "Контекст урока собран";
  }

  return "Текущий шаг собран";
}

function getOverviewDescription(payload: StepPayload, contextPack: ContextPack | undefined): string {
  const taskKind = payload.context.task.kind === "unknown" ? "тип шага не определен" : getTaskKindLabel(payload.context.task.kind);
  const previousStepsCount = contextPack?.stats.includedPreviousSteps ?? 0;

  if (previousStepsCount > 0) {
    return `${taskKind}, ${formatPreviousSteps(previousStepsCount)} в локальном контексте.`;
  }

  return `${taskKind}, предыдущие шаги появятся после посещения ранних шагов урока.`;
}

function createContextList(payload: StepPayload, contextPack: ContextPack | undefined): HTMLElement {
  const list = createElement("dl", "sc-kv-list");
  const metadata = payload.metadata;
  const context = payload.context;

  appendKeyValue(list, "Курс", metadata.courseTitle);
  appendKeyValue(list, "Урок", metadata.lessonTitle);
  appendKeyValue(list, "Шаг", metadata.stepTitle);
  appendKeyValue(list, "Заголовок", payload.title);
  appendKeyValue(list, "Тип", getTaskKindLabel(context.task.kind));
  appendKeyValue(list, "Контекст", contextPack ? formatPreviousSteps(contextPack.stats.includedPreviousSteps) : "только текущий шаг");

  return list;
}

function createPreviousStepsView(contextPack: ContextPack): HTMLElement {
  const wrapper = createElement("div", "sc-context-previous");
  const title = createElement("div", "sc-context-subtitle");
  title.textContent = "Предыдущие посещенные шаги";
  wrapper.append(title);

  if (contextPack.previousSteps.length === 0) {
    wrapper.append(createParagraph("Пока нет посещенных предыдущих шагов этого урока.", "sc-muted"));
    return wrapper;
  }

  const list = createElement("ol", "sc-context-steps");
  contextPack.previousSteps.forEach((step) => {
    const item = createElement("li", "sc-context-step");
    const position = step.context.ids.stepPosition ? `Шаг ${step.context.ids.stepPosition}` : "Шаг";
    const heading = createElement("div", "sc-context-step-title");
    heading.textContent = `${position}: ${step.title || step.metadata.stepTitle || step.url}`;

    const meta = createElement("div", "sc-context-step-meta");
    meta.textContent = "Используется как дополнительный контекст";

    item.append(heading, meta);
    list.append(item);
  });

  wrapper.append(list);

  if (contextPack.stats.truncated) {
    wrapper.append(createParagraph("Контекст ограничен по числу шагов или символов.", "sc-muted"));
  }

  return wrapper;
}

function getTaskKindLabel(kind: StepPayload["context"]["task"]["kind"]): string {
  const labels: Record<StepPayload["context"]["task"]["kind"], string> = {
    choice: "тест",
    code: "код",
    text: "текстовый ответ",
    video: "видео",
    unknown: "неизвестно",
  };

  return labels[kind];
}

function formatCompactNumber(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  }

  return `${value}`;
}

function getHeaderSubtitle(state: SidebarState): string {
  if (state.status === "ready" && state.contextPack) {
    return `${formatPreviousSteps(state.contextPack.stats.includedPreviousSteps)} в контексте`;
  }

  if (state.status === "ready") {
    return "Готов помочь с шагом";
  }

  if (state.status === "collecting") {
    return "Собираю данные со страницы";
  }

  return "Помощник для Stepik";
}

function formatPreviousSteps(count: number): string {
  return `${count} ${pluralizeRu(count, "предыдущий шаг", "предыдущих шага", "предыдущих шагов")}`;
}

function formatFeedbackRecordsCount(count: number): string {
  return `${count} ${pluralizeRu(count, "запись", "записи", "записей")}`;
}

function formatPreviousStepsForDisclosure(count: number): string {
  if (count === 0) {
    return "без предыдущих шагов";
  }

  return `${formatPreviousSteps(count)} из локального контекста`;
}

function formatCommentsForDisclosure(count: number): string {
  if (count === 0) {
    return "без комментариев";
  }

  return `${count} ${pluralizeRu(count, "видимый комментарий", "видимых комментария", "видимых комментариев")}`;
}

function pluralizeRu(count: number, one: string, few: string, many: string): string {
  const absCount = Math.abs(count);
  const lastTwoDigits = absCount % 100;
  const lastDigit = absCount % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return many;
  }

  if (lastDigit === 1) {
    return one;
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return few;
  }

  return many;
}

function createSection(titleText: string, content: Node): HTMLElement {
  const section = createElement("section", "sc-section");
  const title = createElement("h2", "sc-section-title");
  title.textContent = titleText;
  section.append(title, content);

  return section;
}

function createNotice(titleText: string, bodyText: string): HTMLElement {
  const notice = createElement("div", "sc-notice");
  const title = createElement("div", "sc-notice-title");
  title.textContent = titleText;
  const body = createElement("p", "sc-notice-body");
  body.textContent = bodyText;
  notice.append(title, body);

  return notice;
}

function createParagraph(text: string, className: string): HTMLElement {
  const paragraph = createElement("p", className);
  paragraph.textContent = text;

  return paragraph;
}

function appendKeyValue(list: HTMLElement, key: string, value: string | undefined): void {
  if (!value) {
    return;
  }

  const term = createElement("dt");
  term.textContent = key;
  const description = createElement("dd");
  description.textContent = value;
  list.append(term, description);
}

function getStatusLabel(state: SidebarState): string {
  switch (state.status) {
    case "collecting":
      return "Собираю данные";
    case "ready":
      return "Данные собраны";
    case "empty":
      return "Нужна страница шага";
    case "error":
      return "Ошибка сбора";
    case "idle":
      return "Готово к сбору";
  }
}

function createElement(tagName: string, className?: string): HTMLElement {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }

  return element;
}

function createIcon(name: "check" | "chevron-left" | "close" | "copy" | "refresh" | "sparkle" | "spinner" | "trash" | "warning"): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("sc-icon", `is-${name}`);

  const paths: Record<typeof name, string[]> = {
    check: ["M20 6 9 17l-5-5"],
    "chevron-left": ["M15 18 9 12l6-6"],
    close: ["M18 6 6 18", "M6 6l12 12"],
    copy: ["M8 8h10v12H8Z", "M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"],
    refresh: ["M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4", "M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4"],
    sparkle: ["M12 3l1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3Z", "M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"],
    spinner: ["M21 12a9 9 0 0 1-9 9"],
    trash: ["M3 6h18", "M8 6V4h8v2", "M6 6l1 15h10l1-15", "M10 11v6", "M14 11v6"],
    warning: ["M12 8v5", "M12 17h.01", "M10.3 4.6 2.7 18a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0Z"],
  };

  paths[name].forEach((definition) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", definition);
    svg.append(path);
  });

  return svg;
}

const SIDEBAR_CSS = `
  :host {
    --sc-bg: #ffffff;
    --sc-ink: #11181c;
    --sc-text: #1a2227;
    --sc-muted: #66747c;
    --sc-faint: #8b989f;
    --sc-soft: #f5f8f7;
    --sc-soft-strong: #eef4f1;
    --sc-border: #dde7e2;
    --sc-border-strong: #bfd0c8;
    --sc-green: #15915a;
    --sc-green-dark: #0d6f43;
    --sc-green-soft: #e6f6ee;
    --sc-blue: #256d85;
    --sc-blue-soft: #e8f3f6;
    --sc-amber: #b7791f;
    --sc-amber-soft: #fff4da;
    --sc-error: #b5473a;
    --sc-shadow: 0 26px 80px rgba(17, 24, 28, 0.22), 0 5px 18px rgba(17, 24, 28, 0.12);
    color-scheme: light;
    font-family: "IBM Plex Sans", "Aptos", "Segoe UI", "Helvetica Neue", sans-serif;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  .sc-shell {
    all: initial;
    color: var(--sc-text);
    font-family: "IBM Plex Sans", "Aptos", "Segoe UI", "Helvetica Neue", sans-serif;
    position: fixed;
    inset: 0 0 auto auto;
    z-index: 2147483647;
    pointer-events: none;
  }

  .sc-trigger,
  .sc-drawer {
    pointer-events: auto;
  }

  .sc-trigger {
    position: fixed;
    top: min(54vh, 520px);
    right: 0;
    width: 50px;
    min-height: 112px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 12px 7px;
    color: var(--sc-green-dark);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(247, 251, 249, 0.96) 100%),
      repeating-linear-gradient(135deg, rgba(37, 109, 133, 0.08) 0 1px, transparent 1px 7px);
    border: 1px solid var(--sc-border-strong);
    border-right: 0;
    border-radius: 12px 0 0 12px;
    box-shadow: 0 12px 32px rgba(17, 24, 28, 0.16);
    cursor: pointer;
    transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease, right 180ms cubic-bezier(0.2, 0, 0, 1);
  }

  .sc-trigger:hover {
    background:
      linear-gradient(180deg, #ffffff 0%, var(--sc-green-soft) 100%),
      repeating-linear-gradient(135deg, rgba(37, 109, 133, 0.1) 0 1px, transparent 1px 7px);
    transform: translateX(-3px);
    box-shadow: 0 14px 38px rgba(17, 24, 28, 0.2);
  }

  .sc-trigger:focus-visible,
  .sc-icon-button:focus-visible,
  .sc-mode-button:focus-visible,
  .sc-generate-analysis:focus-visible,
  .sc-feedback-button:focus-visible,
  .sc-refresh:focus-visible,
  .sc-clear-feedback:focus-visible,
  .sc-copy-feedback:focus-visible {
    outline: 3px solid rgba(37, 109, 133, 0.26);
    outline-offset: 2px;
  }

  .sc-trigger.is-open {
    right: 432px;
  }

  .sc-trigger-mark {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    color: #ffffff;
    background: linear-gradient(145deg, var(--sc-green-dark), #18a66a);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24), 0 5px 12px rgba(13, 111, 67, 0.24);
    font-size: 14px;
    font-weight: 760;
    line-height: 1;
    letter-spacing: 0;
  }

  .sc-drawer {
    position: fixed;
    top: 0;
    right: 0;
    width: min(432px, calc(100vw - 28px));
    height: 100vh;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    color: var(--sc-text);
    background:
      linear-gradient(180deg, rgba(245, 248, 247, 0.96) 0, rgba(255, 255, 255, 0) 178px),
      radial-gradient(circle at 16px 14px, rgba(37, 109, 133, 0.08) 0 1px, transparent 1.5px),
      var(--sc-bg);
    background-size: auto, 18px 18px, auto;
    border-left: 1px solid var(--sc-border-strong);
    border-radius: 8px 0 0 8px;
    box-shadow: var(--sc-shadow);
    transform: translateX(102%);
    transition: transform 180ms cubic-bezier(0.2, 0, 0, 1);
    overflow: hidden;
  }

  .sc-drawer.is-open {
    transform: translateX(0);
  }

  .sc-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 18px 17px;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(245, 248, 247, 0.78)),
      linear-gradient(90deg, rgba(230, 246, 238, 0.9), rgba(232, 243, 246, 0.5));
    border-bottom: 1px solid var(--sc-border);
  }

  .sc-title-group {
    min-width: 0;
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr);
    align-items: start;
    gap: 12px;
  }

  .sc-brand-mark {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    color: #ffffff;
    background:
      linear-gradient(145deg, var(--sc-green-dark), #19a86a 62%, #49b5c5),
      var(--sc-green-dark);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24), 0 8px 18px rgba(13, 111, 67, 0.22);
    font-size: 16px;
    font-weight: 780;
    line-height: 1;
    letter-spacing: 0;
  }

  .sc-title-wrap {
    min-width: 0;
  }

  .sc-title {
    color: var(--sc-ink);
    font-size: 16px;
    font-weight: 760;
    line-height: 1.2;
    letter-spacing: 0;
  }

  .sc-subtitle {
    margin-top: 3px;
    color: var(--sc-muted);
    font-size: 12px;
    font-weight: 540;
    line-height: 1.32;
    overflow-wrap: anywhere;
  }

  .sc-status {
    display: flex;
    align-items: center;
    width: max-content;
    max-width: 100%;
    gap: 7px;
    margin-top: 10px;
    padding: 5px 9px 5px 7px;
    color: var(--sc-muted);
    background: var(--sc-soft);
    border: 1px solid var(--sc-border);
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.25;
  }

  .sc-status.is-ready {
    color: var(--sc-green-dark);
    background: rgba(230, 246, 238, 0.74);
    border-color: rgba(21, 145, 90, 0.22);
  }

  .sc-status.is-error,
  .sc-status.is-empty {
    color: var(--sc-error);
  }

  .sc-icon-button {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    padding: 0;
    color: var(--sc-text);
    background: transparent;
    border: 0;
    border-radius: 9px;
    cursor: pointer;
  }

  .sc-icon-button:hover {
    background: var(--sc-soft-strong);
  }

  .sc-icon {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .sc-icon.is-spinner {
    animation: sc-spin 800ms linear infinite;
  }

  .sc-body {
    min-height: 0;
    padding: 18px 18px 16px;
    overflow: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--sc-border-strong) transparent;
  }

  .sc-section {
    padding: 0 0 17px;
    margin: 0 0 17px;
    border-bottom: 1px solid var(--sc-border);
  }

  .sc-section:last-child {
    margin-bottom: 0;
  }

  .sc-section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 11px;
    color: var(--sc-ink);
    font-size: 11px;
    font-weight: 780;
    line-height: 1.25;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .sc-section-title::before {
    content: "";
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--sc-green), var(--sc-blue));
    box-shadow: 0 0 0 3px rgba(230, 246, 238, 0.84);
  }

  .sc-overview {
    position: relative;
    padding: 15px;
    margin: 0 0 18px;
    background:
      linear-gradient(135deg, rgba(230, 246, 238, 0.96), rgba(232, 243, 246, 0.54) 54%, rgba(255, 244, 218, 0.36)),
      #ffffff;
    border: 1px solid rgba(191, 208, 200, 0.82);
    border-radius: 8px;
    box-shadow: 0 12px 28px rgba(17, 24, 28, 0.07);
    overflow: hidden;
  }

  .sc-overview::before {
    content: "";
    position: absolute;
    inset: 0 auto 0 0;
    width: 4px;
    background: linear-gradient(180deg, var(--sc-green), var(--sc-blue) 72%, var(--sc-amber));
  }

  .sc-overview-intro {
    min-width: 0;
  }

  .sc-overview-title {
    color: var(--sc-ink);
    font-size: 16px;
    font-weight: 780;
    line-height: 1.25;
    letter-spacing: 0;
  }

  .sc-overview-text {
    margin: 5px 0 0;
    color: var(--sc-muted);
    font-size: 12px;
    font-weight: 520;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  .sc-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 9px;
    margin-top: 14px;
  }

  .sc-metric {
    min-width: 0;
    padding: 10px 8px 9px;
    background: rgba(255, 255, 255, 0.82);
    border: 1px solid rgba(221, 231, 226, 0.86);
    border-radius: 7px;
    box-shadow: 0 4px 12px rgba(17, 24, 28, 0.035);
  }

  .sc-metric:nth-child(2) {
    border-color: rgba(37, 109, 133, 0.2);
    background: rgba(232, 243, 246, 0.68);
  }

  .sc-metric:nth-child(3) {
    border-color: rgba(183, 121, 31, 0.2);
    background: rgba(255, 244, 218, 0.56);
  }

  .sc-metric-label {
    color: var(--sc-faint);
    font-size: 10px;
    font-weight: 720;
    line-height: 1.2;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .sc-metric-value {
    margin-top: 5px;
    color: var(--sc-ink);
    font-size: 18px;
    font-weight: 780;
    line-height: 1;
  }

  .sc-metric-caption {
    margin-top: 4px;
    color: var(--sc-muted);
    font-size: 10px;
    font-weight: 560;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .sc-mode {
    display: grid;
    gap: 7px;
    margin-bottom: 11px;
  }

  .sc-mode-label {
    color: var(--sc-muted);
    font-size: 11px;
    font-weight: 740;
    line-height: 1.2;
  }

  .sc-mode-switcher {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 5px;
    padding: 5px;
    margin-bottom: 10px;
    background: var(--sc-soft);
    border: 1px solid var(--sc-border);
    border-radius: 8px;
  }

  .sc-mode-button {
    min-width: 0;
    min-height: 32px;
    padding: 7px 8px;
    color: var(--sc-muted);
    background: transparent;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 720;
    line-height: 1.2;
    letter-spacing: 0;
    transition: background 160ms ease, color 160ms ease, box-shadow 160ms ease;
  }

  .sc-mode-button:hover {
    color: var(--sc-text);
    background: rgba(255, 255, 255, 0.74);
  }

  .sc-mode-button.is-active {
    color: var(--sc-green-dark);
    background: #ffffff;
    box-shadow: 0 4px 12px rgba(17, 24, 28, 0.1), inset 0 -2px 0 rgba(21, 145, 90, 0.34);
  }

  .sc-analysis {
    padding: 0 0 18px;
    margin: 0 0 17px;
    border-bottom: 1px solid var(--sc-border);
  }

  .sc-analysis-header {
    display: grid;
    gap: 2px;
    margin-bottom: 11px;
  }

  .sc-analysis-header .sc-section-title {
    margin-bottom: 0;
  }

  .sc-analysis-summary,
  .sc-analysis-empty-text,
  .sc-analysis-text {
    margin: 0;
    color: var(--sc-muted);
    font-size: 12px;
    font-weight: 520;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .sc-generate-analysis {
    width: 100%;
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-bottom: 11px;
    padding: 9px 14px;
    color: #ffffff;
    background:
      linear-gradient(135deg, var(--sc-blue), var(--sc-green-dark)),
      var(--sc-green-dark);
    border: 1px solid rgba(13, 111, 67, 0.72);
    border-radius: 8px;
    box-shadow: 0 10px 20px rgba(37, 109, 133, 0.2);
    cursor: pointer;
    font-size: 12px;
    font-weight: 760;
    line-height: 1.2;
    letter-spacing: 0;
    transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
  }

  .sc-generate-analysis:hover {
    background: linear-gradient(135deg, #2b7e99, #0b633b);
    transform: translateY(-1px);
    box-shadow: 0 12px 24px rgba(37, 109, 133, 0.24);
  }

  .sc-generate-analysis:disabled {
    cursor: wait;
    opacity: 0.72;
    transform: none;
  }

  .sc-analysis-empty {
    position: relative;
    padding: 13px 13px 13px 15px;
    background:
      linear-gradient(135deg, rgba(245, 248, 247, 0.92), rgba(232, 243, 246, 0.45)),
      var(--sc-soft);
    border: 1px dashed var(--sc-border-strong);
    border-radius: 8px;
    overflow: hidden;
  }

  .sc-analysis-empty::before {
    content: "";
    position: absolute;
    inset: 12px auto 12px 0;
    width: 3px;
    border-radius: 0 999px 999px 0;
    background: var(--sc-blue);
  }

  .sc-analysis-empty.is-error {
    background: #fff8f6;
    border-color: rgba(181, 71, 58, 0.34);
  }

  .sc-analysis-empty.is-error .sc-analysis-empty-title {
    color: var(--sc-error);
  }

  .sc-request-disclosure {
    display: grid;
    gap: 4px;
    margin: 0 0 10px;
    padding: 10px 11px 10px 12px;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(245, 248, 247, 0.8)),
      #fbfdfc;
    border: 1px solid var(--sc-border);
    border-radius: 8px;
  }

  .sc-request-disclosure-label {
    color: var(--sc-green-dark);
    font-size: 11px;
    font-weight: 780;
    line-height: 1.25;
  }

  .sc-request-disclosure-text {
    margin: 0;
    color: var(--sc-muted);
    font-size: 12px;
    font-weight: 520;
    line-height: 1.42;
    overflow-wrap: anywhere;
  }

  .sc-analysis-empty-title {
    margin: 0 0 4px;
    color: var(--sc-text);
    font-size: 12px;
    font-weight: 760;
    line-height: 1.3;
  }

  .sc-analysis-result {
    display: grid;
    gap: 9px;
    margin-top: 2px;
  }

  .sc-analysis-block {
    position: relative;
    padding: 11px 12px 11px 14px;
    background: #ffffff;
    border: 1px solid var(--sc-border);
    border-radius: 8px;
    box-shadow: 0 4px 14px rgba(17, 24, 28, 0.035);
  }

  .sc-analysis-block::before {
    content: "";
    position: absolute;
    inset: 10px auto 10px 0;
    width: 3px;
    border-radius: 0 999px 999px 0;
    background: var(--sc-border-strong);
  }

  .sc-analysis-block.is-summary {
    background: linear-gradient(135deg, rgba(230, 246, 238, 0.8), rgba(255, 255, 255, 0.92));
    border-color: rgba(191, 208, 200, 0.82);
  }

  .sc-analysis-block.is-summary::before {
    background: var(--sc-green);
  }

  .sc-analysis-block.is-warning {
    background: #fff8f6;
    border-color: rgba(181, 71, 58, 0.24);
  }

  .sc-analysis-block.is-warning::before {
    background: var(--sc-error);
  }

  .sc-analysis-block.is-note::before {
    background: var(--sc-blue);
  }

  .sc-analysis-block-title {
    margin: 0 0 6px;
    color: var(--sc-ink);
    font-size: 12px;
    font-weight: 780;
    line-height: 1.3;
  }

  .sc-analysis-list {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .sc-analysis-list li {
    position: relative;
    margin: 0;
    padding-left: 15px;
    color: var(--sc-text);
    font-size: 12px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .sc-analysis-list li::before {
    content: "";
    position: absolute;
    top: 0.58em;
    left: 0;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--sc-green);
  }

  .sc-analysis-block.is-warning .sc-analysis-list li::before {
    background: var(--sc-error);
  }

  .sc-feedback {
    display: grid;
    gap: 9px;
    margin-top: 1px;
    padding: 12px;
    background:
      linear-gradient(135deg, rgba(251, 253, 252, 0.96), rgba(232, 243, 246, 0.42)),
      #fbfdfc;
    border: 1px solid var(--sc-border);
    border-radius: 8px;
  }

  .sc-feedback-title {
    color: var(--sc-ink);
    font-size: 12px;
    font-weight: 780;
    line-height: 1.3;
  }

  .sc-feedback-hint {
    margin: -4px 0 0;
    color: var(--sc-muted);
    font-size: 12px;
    font-weight: 520;
    line-height: 1.42;
    overflow-wrap: anywhere;
  }

  .sc-feedback-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .sc-feedback-button {
    min-width: 0;
    min-height: 34px;
    padding: 7px 8px;
    color: var(--sc-text);
    background: #ffffff;
    border: 1px solid var(--sc-border);
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: 0;
    transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease;
  }

  .sc-feedback-button:hover:not(:disabled) {
    background: var(--sc-soft);
    transform: translateY(-1px);
  }

  .sc-feedback-button.is-selected {
    color: var(--sc-green-dark);
    background: var(--sc-green-soft);
    border-color: rgba(31, 157, 97, 0.42);
  }

  .sc-feedback-button:disabled {
    cursor: wait;
    opacity: 0.72;
  }

  .sc-kv-list {
    display: grid;
    grid-template-columns: minmax(92px, 0.44fr) minmax(0, 1fr);
    gap: 9px 14px;
    margin: 0;
    color: var(--sc-text);
    font-size: 12px;
    line-height: 1.35;
  }

  .sc-kv-list dt {
    margin: 0;
    color: var(--sc-muted);
    font-weight: 620;
  }

  .sc-kv-list dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    font-weight: 560;
  }

  .sc-context {
    display: grid;
    gap: 14px;
  }

  .sc-context-previous {
    display: grid;
    gap: 9px;
    padding-top: 2px;
  }

  .sc-context-subtitle {
    color: var(--sc-text);
    font-size: 12px;
    font-weight: 720;
    line-height: 1.3;
  }

  .sc-context-steps {
    display: grid;
    gap: 9px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .sc-context-step {
    margin: 0;
    padding: 0 0 0 14px;
    border-left: 3px solid var(--sc-green);
  }

  .sc-context-step-title {
    color: var(--sc-text);
    font-size: 12px;
    font-weight: 650;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .sc-context-step-meta {
    margin-top: 2px;
    color: var(--sc-muted);
    font-size: 11px;
    line-height: 1.3;
  }

  .sc-muted,
  .sc-notice-body {
    margin: 0;
    color: var(--sc-text);
    font-size: 13px;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }

  .sc-muted,
  .sc-notice-body {
    color: var(--sc-muted);
  }

  .sc-notice {
    padding: 15px;
    background:
      linear-gradient(135deg, rgba(245, 248, 247, 0.95), rgba(255, 244, 218, 0.34)),
      var(--sc-soft);
    border: 1px solid var(--sc-border);
    border-radius: 8px;
  }

  .sc-notice-title {
    margin: 0 0 6px;
    color: var(--sc-text);
    font-size: 13px;
    font-weight: 720;
    line-height: 1.3;
  }

  .sc-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
    padding: 14px 18px 16px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(248, 251, 250, 0.96)),
      rgba(255, 255, 255, 0.92);
    border-top: 1px solid var(--sc-border);
    box-shadow: 0 -10px 24px rgba(17, 24, 28, 0.045);
  }

  .sc-refresh {
    grid-column: 1 / -1;
    width: 100%;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    padding: 10px 16px;
    color: #ffffff;
    background: linear-gradient(135deg, var(--sc-green), var(--sc-green-dark));
    border: 1px solid var(--sc-green-dark);
    border-radius: 8px;
    box-shadow: 0 9px 22px rgba(21, 145, 90, 0.24);
    cursor: pointer;
    font-size: 13px;
    font-weight: 760;
    line-height: 1.2;
    letter-spacing: 0;
    transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
  }

  .sc-refresh:hover:not(:disabled) {
    background: linear-gradient(135deg, #18a166, var(--sc-green-dark));
    border-color: #0a5e38;
    transform: translateY(-1px);
  }

  .sc-refresh:disabled {
    cursor: wait;
    opacity: 0.72;
  }

  .sc-clear-feedback,
  .sc-copy-feedback {
    width: 100%;
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px 10px;
    color: var(--sc-muted);
    background: #ffffff;
    border: 1px solid var(--sc-border);
    border-radius: 7px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 720;
    line-height: 1.2;
    letter-spacing: 0;
    transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease;
  }

  .sc-clear-feedback:hover:not(:disabled),
  .sc-copy-feedback:hover:not(:disabled) {
    color: var(--sc-text);
    background: var(--sc-soft);
    border-color: var(--sc-border-strong);
    transform: translateY(-1px);
  }

  .sc-clear-feedback:disabled,
  .sc-copy-feedback:disabled {
    cursor: wait;
    opacity: 0.72;
  }

  .sc-action-status {
    grid-column: 1 / -1;
    margin-top: -2px;
    color: var(--sc-muted);
    font-size: 12px;
    font-weight: 560;
    line-height: 1.35;
    text-align: center;
    overflow-wrap: anywhere;
  }

  .sc-action-status.is-cleared,
  .sc-action-status.is-copied {
    color: var(--sc-green-dark);
  }

  .sc-action-status.is-error {
    color: var(--sc-error);
  }

  .sc-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    padding: 10px 18px 11px;
    color: #879198;
    background: #f8fbfa;
    border-top: 1px solid var(--sc-border);
    font-size: 12px;
    line-height: 1.25;
  }

  .sc-footer span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @keyframes sc-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 520px) {
    .sc-trigger.is-open {
      right: min(432px, calc(100vw - 28px));
    }

    .sc-header,
    .sc-body,
    .sc-actions,
    .sc-footer {
      padding-left: 16px;
      padding-right: 16px;
    }

    .sc-metrics {
      grid-template-columns: 1fr;
    }

    .sc-actions {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sc-trigger,
    .sc-drawer,
    .sc-generate-analysis,
    .sc-clear-feedback,
    .sc-copy-feedback,
    .sc-refresh {
      transition: none;
    }

    .sc-icon.is-spinner {
      animation: none;
    }
  }
`;
