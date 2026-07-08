import type { StepPayload } from "./stepPayload";

export type SidebarState =
  | { status: "idle"; payload?: StepPayload }
  | { status: "collecting"; payload?: StepPayload }
  | { status: "ready"; payload: StepPayload }
  | { status: "empty"; payload?: StepPayload }
  | { status: "error"; message: string; payload?: StepPayload };

type SidebarController = {
  setState: (nextState: SidebarState) => void;
};

type SidebarOptions = {
  onRefresh: () => void;
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
  let copyState: "idle" | "copied" | "error" = "idle";

  function setState(nextState: SidebarState): void {
    state = nextState;
    copyState = "idle";
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
    const titleWrap = createElement("div", "sc-title-wrap");
    const title = createElement("div", "sc-title");
    title.textContent = "Stepik Copilot";
    const status = createStatus();
    titleWrap.append(title, status);

    const closeButton = createElement("button", "sc-icon-button") as HTMLButtonElement;
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Закрыть Stepik Copilot");
    closeButton.append(createIcon("close"));
    closeButton.addEventListener("click", () => {
      isOpen = false;
      render();
    });

    header.append(titleWrap, closeButton);

    const body = createElement("div", "sc-body");
    appendStateContent(body);

    const actions = createElement("div", "sc-actions");
    const payload = state.payload;
    if (payload?.stepMarkdown) {
      const copyButton = createElement("button", `sc-copy is-${copyState}`) as HTMLButtonElement;
      copyButton.type = "button";
      copyButton.append(createIcon(copyState === "copied" ? "check" : "copy"), document.createTextNode(getCopyButtonLabel(copyState)));
      copyButton.addEventListener("click", () => copyMarkdown(payload.stepMarkdown));
      actions.append(copyButton);
    }

    const refreshButton = createElement("button", "sc-refresh") as HTMLButtonElement;
    refreshButton.type = "button";
    refreshButton.disabled = state.status === "collecting";
    refreshButton.append(createIcon("refresh"), document.createTextNode("Обновить данные"));
    refreshButton.addEventListener("click", options.onRefresh);
    actions.append(refreshButton);

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
      createSection("Контекст", createContextList(payload)),
      createSection("Текст шага", createStepContentView(payload)),
      createSection("Комментарии", createCommentsView(payload)),
      createSection("Технически", createTechnicalList(payload)),
    );

    return fragment;
  }

  render();

  return {
    setState,
  };

  async function copyMarkdown(markdown: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(markdown);
      copyState = "copied";
    } catch {
      copyState = "error";
    }

    render();
    window.setTimeout(() => {
      copyState = "idle";
      render();
    }, 1_600);
  }
}

function createContextList(payload: StepPayload): HTMLElement {
  const list = createElement("dl", "sc-kv-list");
  const metadata = payload.metadata;
  const context = payload.context;

  appendKeyValue(list, "Курс", metadata.courseTitle);
  appendKeyValue(list, "Урок", metadata.lessonTitle);
  appendKeyValue(list, "Шаг", metadata.stepTitle);
  appendKeyValue(list, "Заголовок", payload.title);
  appendKeyValue(list, "Тип", getTaskKindLabel(context.task.kind));
  appendKeyValue(list, "Lesson ID", context.ids.lessonId);
  appendKeyValue(list, "Unit ID", context.ids.unitId);
  appendKeyValue(list, "Позиция", context.ids.stepPosition);

  return list;
}

function createTechnicalList(payload: StepPayload): HTMLElement {
  const list = createElement("dl", "sc-kv-list");
  const context = payload.context;

  appendKeyValue(list, "URL", payload.url);
  appendKeyValue(list, "Комментарии", `${payload.comments.length}`);
  appendKeyValue(list, "Треды", `${context.stats.commentThreadsCount}`);
  appendKeyValue(list, "Ответы", `${context.stats.repliesCount}`);
  appendKeyValue(list, "Символы шага", `${payload.stepText.length}`);
  appendKeyValue(list, "Markdown", `${payload.stepMarkdown.length}`);
  appendKeyValue(list, "Варианты", formatOptionalNumber(context.task.answerOptionsCount));
  appendKeyValue(list, "Controls", context.task.hasAnswerControls ? "есть" : "нет");
  appendKeyValue(list, "Версия", context.stats.extractionVersion);
  appendKeyValue(list, "Собрано", formatCollectedAt(context.stats.collectedAt));

  return list;
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

function formatOptionalNumber(value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${value}`;
}

function formatCollectedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getCopyButtonLabel(copyState: "idle" | "copied" | "error"): string {
  if (copyState === "copied") {
    return "Markdown скопирован";
  }

  if (copyState === "error") {
    return "Не удалось скопировать";
  }

  return "Скопировать MD";
}

function createStepContentView(payload: StepPayload): HTMLElement {
  const markdown = payload.stepMarkdown || payload.stepText;

  if (!markdown) {
    return createParagraph("Текст шага пока не найден.", "sc-muted");
  }

  return createMarkdownPreview(markdown);
}

function createMarkdownPreview(markdown: string): HTMLElement {
  const root = createElement("div", "sc-markdown");
  const lines = markdown.split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed === "```") {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== "```") {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      root.append(createCodeBlock(codeLines.join("\n")));
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const heading = createElement("div", `sc-md-heading is-h${headingMatch[1].length}`);
      appendInlineMarkdown(heading, headingMatch[2]);
      root.append(heading);
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const list = createElement("ul", "sc-md-list");
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        const item = createElement("li");
        appendInlineMarkdown(item, lines[index].trim().replace(/^[-*]\s+/, ""));
        list.append(item);
        index += 1;
      }
      root.append(list);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const list = createElement("ol", "sc-md-list");
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        const item = createElement("li");
        appendInlineMarkdown(item, lines[index].trim().replace(/^\d+\.\s+/, ""));
        list.append(item);
        index += 1;
      }
      root.append(list);
      continue;
    }

    if (trimmed.startsWith("> ")) {
      const quote = createElement("blockquote", "sc-md-quote");
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("> ")) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      appendInlineMarkdown(quote, quoteLines.join(" "));
      root.append(quote);
      continue;
    }

    const paragraphLines = [trimmed];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isMarkdownBlockStart(lines[index].trim())) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    const paragraph = createElement("p", "sc-md-paragraph");
    appendInlineMarkdown(paragraph, paragraphLines.join(" "));
    root.append(paragraph);
  }

  return root;
}

function isMarkdownBlockStart(line: string): boolean {
  return line === "```" || /^(#{1,6})\s+/.test(line) || /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line) || line.startsWith("> ");
}

function createCodeBlock(code: string): HTMLElement {
  const pre = createElement("pre", "sc-md-code");
  const codeElement = createElement("code");
  codeElement.textContent = code;
  pre.append(codeElement);

  return pre;
}

function appendInlineMarkdown(parent: HTMLElement, text: string): void {
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parent.append(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    if (match[2]) {
      const strong = createElement("strong");
      strong.textContent = match[2];
      parent.append(strong);
    } else if (match[3]) {
      const code = createElement("code", "sc-md-inline-code");
      code.textContent = match[3];
      parent.append(code);
    } else if (match[4] && match[5]) {
      const link = createElement("a", "sc-md-link") as HTMLAnchorElement;
      link.href = match[5];
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = match[4];
      parent.append(link);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parent.append(document.createTextNode(text.slice(lastIndex)));
  }
}

function createCommentsView(payload: StepPayload): HTMLElement {
  if (payload.commentThreads.length > 0) {
    return createCommentThreadsList(payload.commentThreads);
  }

  return createCommentsList(payload.comments);
}

function createCommentThreadsList(commentThreads: StepPayload["commentThreads"]): HTMLElement {
  const list = createElement("ol", "sc-comment-threads");

  commentThreads.forEach((thread) => {
    const item = createElement("li", "sc-thread");
    item.append(createCommentEntry(thread.root, "root"));

    if (thread.replies.length > 0) {
      const replies = createElement("ol", "sc-replies");
      thread.replies.forEach((reply) => {
        const replyItem = createElement("li", "sc-reply");
        replyItem.append(createCommentEntry(reply, "reply"));
        replies.append(replyItem);
      });
      item.append(replies);
    }

    list.append(item);
  });

  return list;
}

function createCommentEntry(entry: StepPayload["commentThreads"][number]["root"], kind: "root" | "reply"): HTMLElement {
  const wrapper = createElement("div", `sc-comment-entry is-${kind}`);

  if (entry.author || entry.relativeTime) {
    const meta = createElement("div", "sc-comment-meta");
    meta.textContent = [entry.author, entry.relativeTime].filter(Boolean).join(" · ");
    wrapper.append(meta);
  }

  const text = createElement("p", "sc-comment-text");
  text.textContent = entry.text;
  wrapper.append(text);

  return wrapper;
}

function createCommentsList(comments: string[]): HTMLElement {
  if (comments.length === 0) {
    return createParagraph("Видимые комментарии не найдены.", "sc-muted");
  }

  const list = createElement("ol", "sc-comments");
  comments.forEach((comment) => {
    const item = createElement("li", "sc-comment");
    item.textContent = comment;
    list.append(item);
  });

  return list;
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

function createIcon(name: "check" | "chevron-left" | "close" | "copy" | "refresh" | "spinner" | "warning"): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("sc-icon", `is-${name}`);

  const paths: Record<typeof name, string[]> = {
    check: ["M20 6 9 17l-5-5"],
    "chevron-left": ["M15 18 9 12l6-6"],
    close: ["M18 6 6 18", "M6 6l12 12"],
    copy: ["M8 8h10v10H8z", "M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"],
    refresh: ["M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4", "M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4"],
    spinner: ["M21 12a9 9 0 0 1-9 9"],
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
    --sc-text: #161a1d;
    --sc-muted: #687076;
    --sc-soft: #f6f8f7;
    --sc-border: #dfe5e1;
    --sc-border-strong: #c8d3ce;
    --sc-green: #1f9d61;
    --sc-green-dark: #167a49;
    --sc-green-soft: #e9f7ef;
    --sc-error: #b5473a;
    --sc-shadow: 0 18px 48px rgba(22, 26, 29, 0.18), 0 2px 10px rgba(22, 26, 29, 0.08);
    color-scheme: light;
    font-family: "Aptos", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  .sc-shell {
    all: initial;
    color: var(--sc-text);
    font-family: "Aptos", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
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
    width: 54px;
    min-height: 96px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 10px 8px;
    color: var(--sc-green-dark);
    background: var(--sc-bg);
    border: 1px solid var(--sc-border-strong);
    border-right: 0;
    border-radius: 8px 0 0 8px;
    box-shadow: 0 8px 24px rgba(22, 26, 29, 0.16);
    cursor: pointer;
    transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
  }

  .sc-trigger:hover {
    background: var(--sc-green-soft);
    transform: translateX(-2px);
    box-shadow: 0 10px 28px rgba(22, 26, 29, 0.2);
  }

  .sc-trigger.is-open {
    right: 380px;
  }

  .sc-trigger-mark {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #ffffff;
    background: var(--sc-green-dark);
    font-size: 14px;
    font-weight: 760;
    line-height: 1;
    letter-spacing: 0;
  }

  .sc-drawer {
    position: fixed;
    top: 0;
    right: 0;
    width: min(380px, calc(100vw - 28px));
    height: 100vh;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    color: var(--sc-text);
    background: var(--sc-bg);
    border-left: 1px solid var(--sc-border-strong);
    border-radius: 6px 0 0 6px;
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
    padding: 20px 20px 16px;
    border-bottom: 1px solid var(--sc-border);
  }

  .sc-title {
    color: var(--sc-text);
    font-size: 17px;
    font-weight: 740;
    line-height: 1.2;
    letter-spacing: 0;
  }

  .sc-status {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
    color: var(--sc-muted);
    font-size: 13px;
    font-weight: 680;
    line-height: 1.25;
  }

  .sc-status.is-ready {
    color: var(--sc-green-dark);
  }

  .sc-status.is-error,
  .sc-status.is-empty {
    color: var(--sc-error);
  }

  .sc-icon-button {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    padding: 0;
    color: var(--sc-text);
    background: transparent;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
  }

  .sc-icon-button:hover {
    background: var(--sc-soft);
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
    padding: 18px 20px;
    overflow: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--sc-border-strong) transparent;
  }

  .sc-section {
    padding: 0 0 18px;
    margin: 0 0 18px;
    border-bottom: 1px solid var(--sc-border);
  }

  .sc-section:last-child {
    margin-bottom: 0;
  }

  .sc-section-title {
    margin: 0 0 10px;
    color: var(--sc-text);
    font-size: 14px;
    font-weight: 740;
    line-height: 1.25;
    letter-spacing: 0;
  }

  .sc-kv-list {
    display: grid;
    grid-template-columns: minmax(84px, 0.42fr) minmax(0, 1fr);
    gap: 9px 14px;
    margin: 0;
    color: var(--sc-text);
    font-size: 13px;
    line-height: 1.35;
  }

  .sc-kv-list dt {
    margin: 0;
    color: var(--sc-muted);
    font-weight: 560;
  }

  .sc-kv-list dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    font-weight: 520;
  }

  .sc-step-text,
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

  .sc-markdown {
    display: grid;
    gap: 10px;
    color: var(--sc-text);
    font-size: 13px;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }

  .sc-markdown > * {
    margin: 0;
  }

  .sc-md-heading {
    color: var(--sc-text);
    font-weight: 760;
    line-height: 1.28;
    letter-spacing: 0;
  }

  .sc-md-heading.is-h1,
  .sc-md-heading.is-h2 {
    font-size: 15px;
  }

  .sc-md-heading.is-h3,
  .sc-md-heading.is-h4,
  .sc-md-heading.is-h5,
  .sc-md-heading.is-h6 {
    font-size: 14px;
  }

  .sc-md-paragraph {
    font-size: 13px;
    line-height: 1.55;
  }

  .sc-md-list {
    display: grid;
    gap: 6px;
    padding-left: 18px;
    font-size: 13px;
    line-height: 1.5;
  }

  .sc-md-code {
    max-width: 100%;
    padding: 10px 11px;
    color: #22312b;
    background: #f3f6f5;
    border: 1px solid var(--sc-border);
    border-radius: 6px;
    overflow: auto;
    font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
    font-size: 12px;
    line-height: 1.45;
    white-space: pre;
  }

  .sc-md-inline-code {
    padding: 1px 4px;
    color: #174c33;
    background: var(--sc-green-soft);
    border-radius: 4px;
    font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
    font-size: 12px;
  }

  .sc-md-link {
    color: #1473e6;
    text-decoration: none;
    border-bottom: 1px solid rgba(20, 115, 230, 0.28);
  }

  .sc-md-link:hover {
    border-bottom-color: currentColor;
  }

  .sc-md-quote {
    padding: 8px 10px;
    color: var(--sc-muted);
    background: var(--sc-soft);
    border-left: 3px solid var(--sc-green);
    border-radius: 0 6px 6px 0;
    font-size: 13px;
    line-height: 1.5;
  }

  .sc-comments {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .sc-comment {
    position: relative;
    margin: 0;
    padding: 0 0 0 16px;
    color: var(--sc-text);
    font-size: 13px;
    line-height: 1.48;
    overflow-wrap: anywhere;
  }

  .sc-comment::before {
    content: "";
    position: absolute;
    top: 0.62em;
    left: 0;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--sc-green);
  }

  .sc-comment-threads {
    display: grid;
    gap: 14px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .sc-thread {
    margin: 0;
    padding: 0;
  }

  .sc-comment-entry {
    position: relative;
    padding-left: 14px;
  }

  .sc-comment-entry::before {
    content: "";
    position: absolute;
    top: 0.72em;
    left: 0;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--sc-green);
  }

  .sc-comment-entry.is-reply {
    padding-left: 12px;
  }

  .sc-comment-entry.is-reply::before {
    width: 4px;
    height: 4px;
    background: var(--sc-muted);
  }

  .sc-comment-meta {
    margin: 0 0 3px;
    color: var(--sc-muted);
    font-size: 11px;
    font-weight: 650;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .sc-comment-text {
    margin: 0;
    color: var(--sc-text);
    font-size: 13px;
    line-height: 1.48;
    overflow-wrap: anywhere;
  }

  .sc-replies {
    display: grid;
    gap: 10px;
    margin: 10px 0 0 12px;
    padding: 0 0 0 12px;
    border-left: 1px solid var(--sc-border);
    list-style: none;
  }

  .sc-reply {
    margin: 0;
    padding: 0;
  }

  .sc-notice {
    padding: 14px;
    background: var(--sc-soft);
    border: 1px solid var(--sc-border);
    border-radius: 6px;
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
    gap: 10px;
    padding: 16px 20px 20px;
    border-top: 1px solid var(--sc-border);
  }

  .sc-copy {
    width: 100%;
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 9px 14px;
    color: var(--sc-text);
    background: var(--sc-bg);
    border: 1px solid var(--sc-border-strong);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: 0;
    transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
  }

  .sc-copy:hover {
    background: var(--sc-soft);
    transform: translateY(-1px);
  }

  .sc-copy.is-copied {
    color: var(--sc-green-dark);
    border-color: rgba(31, 157, 97, 0.42);
    background: var(--sc-green-soft);
  }

  .sc-copy.is-error {
    color: var(--sc-error);
  }

  .sc-refresh {
    width: 100%;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    padding: 10px 16px;
    color: #ffffff;
    background: var(--sc-green);
    border: 1px solid var(--sc-green);
    border-radius: 6px;
    box-shadow: 0 8px 20px rgba(31, 157, 97, 0.22);
    cursor: pointer;
    font-size: 14px;
    font-weight: 720;
    line-height: 1.2;
    letter-spacing: 0;
    transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
  }

  .sc-refresh:hover:not(:disabled) {
    background: var(--sc-green-dark);
    border-color: var(--sc-green-dark);
    transform: translateY(-1px);
  }

  .sc-refresh:disabled {
    cursor: wait;
    opacity: 0.72;
  }

  .sc-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    padding: 12px 20px;
    color: #879198;
    background: #f8faf9;
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
      right: min(380px, calc(100vw - 28px));
    }

    .sc-header,
    .sc-body,
    .sc-actions,
    .sc-footer {
      padding-left: 16px;
      padding-right: 16px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sc-trigger,
    .sc-drawer,
    .sc-refresh {
      transition: none;
    }

    .sc-icon.is-spinner {
      animation: none;
    }
  }
`;
