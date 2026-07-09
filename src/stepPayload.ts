export type StepPayload = {
  url: string;
  title?: string;
  stepText: string;
  stepMarkdown: string;
  stepContent: StepContent;
  comments: string[];
  commentThreads: CommentThread[];
  metadata: {
    courseTitle?: string;
    lessonTitle?: string;
    stepTitle?: string;
  };
  context: StepContext;
};

export type StepContext = {
  ids: {
    courseId?: string;
    lessonId?: string;
    unitId?: string;
    stepPosition?: string;
  };
  page: {
    hostname: string;
    path: string;
    language?: string;
  };
  task: {
    kind: StepKind;
    hasAnswerControls: boolean;
    hasChoiceOptions: boolean;
    hasCodeEditor: boolean;
    answerOptionsCount?: number;
  };
  stats: {
    stepTextLength: number;
    commentsCount: number;
    commentThreadsCount: number;
    repliesCount: number;
    collectedAt: string;
    extractionVersion: "dom-v2";
  };
};

export type StepKind = "choice" | "code" | "text" | "video" | "unknown";

export type StepContent = {
  format: "markdown";
  markdown: string;
  plainText: string;
};

export type CommentThread = {
  root: CommentEntry;
  replies: CommentEntry[];
};

export type CommentEntry = {
  text: string;
  author?: string;
  relativeTime?: string;
  mentions: string[];
};

const STEP_TEXT_SELECTORS = [
  "[data-qa='step-text']",
  "[data-qa='step-content']",
  ".step-inner__text",
  ".step-inner__block",
  ".step__text",
  ".step__content",
  ".step-view__content",
  ".step-content",
  ".lesson-step",
  ".lesson__step",
  ".attempt__content",
  ".html-content",
  ".step-text",
  "article",
  "main",
];

const COMMENT_TEXT_SELECTORS = [
  "[data-qa='comment-text']",
  "[data-qa='comment-content']",
  ".comment__text",
  ".comment__body",
  ".comments-comment__viewer",
  ".comments-comment__content .html-content",
  ".comments__comment-text",
  ".comments__item-text",
  ".comments__item-content .html-content",
  ".comments__content .html-content",
  "[class*='comment'] [class*='text']",
  "[class*='comment'] [class*='body']",
  "[class*='discussion'] [class*='text']",
  "[class*='discussion'] [class*='body']",
];

const STEPIK_COMMENT_SELECTORS = [
  ".comments-comment",
  ".comment",
  ".discussion-comment",
];

const STEPIK_REPLY_SELECTORS = [
  ".comments-card__replies .comment-reply__container",
  ".comments-card__replies .discussions__comment-widget",
  ".comments-card__replies .comments-comment",
];

const COMMENT_AUTHOR_SELECTORS = [
  ".comments-user-badge__name",
  "[class*='author']",
  "[data-qa*='author']",
];

const COMMENT_DATE_SELECTORS = [
  ".comments-comment__date",
  "time",
  "[class*='date']",
  "[class*='time']",
  "[data-qa*='date']",
  "[data-qa*='time']",
];

const COMMENT_CONTAINER_SELECTORS = [
  "[data-qa='comment']",
  ".comments__comment",
  ".comments__item",
  ".comment",
  ".discussion-comment",
  ".discussion-thread__comment",
];

const COURSE_TITLE_SELECTORS = [
  "[data-qa='course-title']",
  ".course-title",
  ".course-sidebar__title",
  ".course-info__title",
  "a[href*='/course/']",
];

const LESSON_TITLE_SELECTORS = [
  "[data-qa='lesson-title']",
  ".lesson-title",
  ".lesson__title",
  ".top-tools__lesson-title",
  "a[href*='/lesson/']",
];

const STEP_TITLE_SELECTORS = [
  "[data-qa='step-title']",
  ".step-title",
  ".lesson-step__title",
  ".step-view__title",
  "h1",
  "h2",
];

const CHOICE_OPTION_SELECTORS = [
  "[data-qa*='choice']",
  "[class*='choice']",
  "[class*='option'] input[type='radio']",
  "[class*='option'] input[type='checkbox']",
  "input[type='radio']",
  "input[type='checkbox']",
];

const CODE_EDITOR_SELECTORS = [
  ".CodeMirror",
  ".cm-editor",
  "[class*='code-editor']",
  "[class*='code_editor']",
  "[data-qa*='code-editor']",
  "textarea[class*='code']",
];

const TEXT_ANSWER_SELECTORS = [
  "textarea:not([class*='code'])",
  "input[type='text']",
  "[contenteditable='true']",
];

const VIDEO_SELECTORS = [
  "video",
  "iframe[src*='youtube']",
  "iframe[src*='vimeo']",
  "[class*='video']",
  "[data-qa*='video']",
];

const REMOVABLE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "svg",
  "nav",
  "footer",
  "header",
  "aside",
  "form",
  "button",
  "input",
  "textarea",
  "select",
  "[aria-live]",
  "[class*='feedback']",
  "[class*='submission']",
  "[class*='attempt__actions']",
  "[class*='attempt__message']",
  "[class*='attempt__result']",
  "[class*='attempt__feedback']",
  "[class*='quiz__feedback']",
  "[data-qa*='feedback']",
  "[data-qa*='result']",
  "[class*='comment']",
  "[class*='discussion']",
  "[data-qa='comment']",
  "[data-qa='comment-text']",
];

const IGNORED_COMMENT_TEXTS = new Set([
  "оставить комментарий",
  "комментировать",
  "ответить",
  "показать полностью",
  "скрыть",
  "сегодня",
  "вчера",
  "позавчера",
]);

const COMMENT_REMOVABLE_SELECTORS = [
  "button",
  "input",
  "textarea",
  "select",
  "svg",
  "[role='button']",
  "[aria-hidden='true']",
  "[class*='avatar']",
  "[class*='author']",
  "[class*='user']",
  "[class*='date']",
  "[class*='time']",
  "[class*='reply']",
  "[class*='action']",
  "[class*='toolbar']",
  "[class*='controls']",
  "[data-qa*='author']",
  "[data-qa*='date']",
  "[data-qa*='time']",
  "[data-qa*='reply']",
  "[data-qa*='action']",
];

const COMMENT_METADATA_PATTERNS = [
  /^anonymous\s+\d+$/i,
  /^anonymous\s+\d+\s+\d+\s+\S+\s+назад$/i,
  /^anonymous\s+\d+\s+\d+\s+\S+\s+назад\s*ответить$/i,
  /^\d+\s+(секунд[уы]?|минут[уы]?|час(?:а|ов)?|дн(?:я|ей)?|недел[яьиь]|месяц(?:а|ев)?|год(?:а|лет)?)\s+назад$/i,
  /^\d+\s+ответить$/i,
  /^посмотреть\s+\d+\s+ответ(?:а|ов)?$/i,
  /^скрыть\s+\d+\s+ответ(?:а|ов)?$/i,
];

const RELATIVE_TIME_PATTERN =
  "\\d+\\s+(?:секунд[уы]?|минут[уы]?|час(?:а|ов)?|дн(?:я|ей)?|недел[яьиь]|месяц(?:а|ев)?|год(?:а|лет)?)\\s+назад";

const STEP_STATUS_PHRASES = [
  "Здорово, всё верно.",
  "Здорово, все верно.",
  "Прекрасный ответ.",
  "Правильно.",
  "Неправильно.",
];

export function extractStepPayload(documentRef: Document = document): StepPayload {
  const metadata = {
    courseTitle: findFirstText(documentRef, COURSE_TITLE_SELECTORS),
    lessonTitle: findFirstText(documentRef, LESSON_TITLE_SELECTORS),
    stepTitle: findFirstText(documentRef, STEP_TITLE_SELECTORS),
  };
  const stepContent = extractStepContent(documentRef);
  const stepText = stepContent.plainText;
  const commentThreads = extractCommentThreads(documentRef);
  const comments = flattenCommentThreads(commentThreads) ?? extractLooseComments(documentRef);
  const title = cleanText(documentRef.title) || metadata.stepTitle;

  return {
    url: documentRef.location.href,
    title,
    stepText,
    stepMarkdown: stepContent.markdown,
    stepContent,
    comments,
    commentThreads,
    metadata: removeEmptyValues(metadata),
    context: createStepContext(documentRef, {
      comments,
      commentThreads,
      metadata,
      stepText,
    }),
  };
}

function createStepContext(
  documentRef: Document,
  payloadParts: {
    comments: string[];
    commentThreads: CommentThread[];
    metadata: StepPayload["metadata"];
    stepText: string;
  },
): StepContext {
  const url = parseDocumentUrl(documentRef);
  const task = detectTaskContext(documentRef);

  return {
    ids: extractIdsFromUrl(url),
    page: {
      hostname: url.hostname,
      path: url.pathname,
      language: documentRef.documentElement.lang || undefined,
    },
    task,
    stats: {
      stepTextLength: payloadParts.stepText.length,
      commentsCount: payloadParts.comments.length,
      commentThreadsCount: payloadParts.commentThreads.length,
      repliesCount: payloadParts.commentThreads.reduce((sum, thread) => sum + thread.replies.length, 0),
      collectedAt: new Date().toISOString(),
      extractionVersion: "dom-v2",
    },
  };
}

function parseDocumentUrl(documentRef: Document): URL {
  return new URL(documentRef.location.href);
}

function extractIdsFromUrl(url: URL): StepContext["ids"] {
  const lessonMatch = url.pathname.match(/\/lesson\/(\d+)(?:\/step\/(\d+))?/);
  const courseMatch = url.pathname.match(/\/course\/(\d+)/);
  const unitId = url.searchParams.get("unit") ?? undefined;

  return removeEmptyValues({
    courseId: courseMatch?.[1],
    lessonId: lessonMatch?.[1],
    unitId,
    stepPosition: lessonMatch?.[2],
  });
}

function detectTaskContext(documentRef: Document): StepContext["task"] {
  const choiceOptionsCount = countVisibleMatches(documentRef, CHOICE_OPTION_SELECTORS);
  const hasChoiceOptions = choiceOptionsCount > 0;
  const hasCodeEditor = hasVisibleMatch(documentRef, CODE_EDITOR_SELECTORS);
  const hasTextAnswer = hasVisibleMatch(documentRef, TEXT_ANSWER_SELECTORS);
  const hasVideo = hasVisibleMatch(documentRef, VIDEO_SELECTORS);
  const kind = detectStepKind({
    hasChoiceOptions,
    hasCodeEditor,
    hasTextAnswer,
    hasVideo,
  });

  return removeEmptyValues({
    kind,
    hasAnswerControls: hasChoiceOptions || hasCodeEditor || hasTextAnswer,
    hasChoiceOptions,
    hasCodeEditor,
    answerOptionsCount: hasChoiceOptions ? choiceOptionsCount : undefined,
  });
}

function detectStepKind(signals: {
  hasChoiceOptions: boolean;
  hasCodeEditor: boolean;
  hasTextAnswer: boolean;
  hasVideo: boolean;
}): StepKind {
  if (signals.hasCodeEditor) {
    return "code";
  }

  if (signals.hasChoiceOptions) {
    return "choice";
  }

  if (signals.hasTextAnswer) {
    return "text";
  }

  if (signals.hasVideo) {
    return "video";
  }

  return "unknown";
}

function extractStepContent(documentRef: Document): StepContent {
  const root = findFirstVisibleElement(documentRef, STEP_TEXT_SELECTORS) ?? documentRef.body;
  if (!root) {
    return {
      format: "markdown",
      markdown: "",
      plainText: "",
    };
  }

  const textClone = cloneStepContentRoot(root);
  const markdownClone = cloneStepContentRoot(root);
  const choiceOptions = extractChoiceOptionTexts(documentRef);
  const plainText = appendMissingChoiceOptionsToText(sanitizeStepText(cleanText(textClone.textContent)), choiceOptions);
  const markdown = appendMissingChoiceOptionsToMarkdown(sanitizeStepMarkdown(domToMarkdown(markdownClone)) || plainText, choiceOptions);

  return {
    format: "markdown",
    markdown,
    plainText,
  };
}

function cloneStepContentRoot(root: HTMLElement): HTMLElement {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(REMOVABLE_SELECTORS.join(",")).forEach((element) => element.remove());

  return clone;
}

function extractChoiceOptionTexts(documentRef: Document): string[] {
  const optionElements = Array.from(documentRef.querySelectorAll<HTMLElement>("label")).filter((label) => {
    return Boolean(label.querySelector("input[type='radio'], input[type='checkbox']"));
  });

  const fallbackOptionElements = CHOICE_OPTION_SELECTORS.flatMap((selector) => {
    return Array.from(documentRef.querySelectorAll<HTMLElement>(selector)).map((element) => {
      return element.closest<HTMLElement>("label, [class*='option'], [class*='choice'], [data-qa*='choice']") ?? element;
    });
  });

  const candidates = optionElements.length > 0 ? optionElements : fallbackOptionElements;

  return uniqueTexts(
    uniqueElements(candidates)
      .filter(isVisible)
      .map(extractChoiceOptionText)
      .filter((text): text is string => Boolean(text)),
  );
}

function extractChoiceOptionText(element: HTMLElement): string | undefined {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll([
    "input",
    "button",
    "svg",
    "[aria-hidden='true']",
    "[class*='feedback']",
    "[class*='result']",
    "[data-qa*='feedback']",
    "[data-qa*='result']",
  ].join(",")).forEach((node) => node.remove());

  const text = sanitizeStepText(cleanText(clone.textContent));

  return text || undefined;
}

function appendMissingChoiceOptionsToText(stepText: string, choiceOptions: string[]): string {
  const missingOptions = getMissingChoiceOptions(stepText, choiceOptions);

  return [stepText, ...missingOptions].filter(Boolean).join(" ").trim();
}

function appendMissingChoiceOptionsToMarkdown(markdown: string, choiceOptions: string[]): string {
  const missingOptions = getMissingChoiceOptions(markdown, choiceOptions);
  if (missingOptions.length === 0) {
    return markdown;
  }

  const optionsMarkdown = missingOptions.map((option) => `- ${option}`).join("\n");

  return sanitizeStepMarkdown([markdown, "Варианты:", optionsMarkdown].filter(Boolean).join("\n\n"));
}

function getMissingChoiceOptions(value: string, choiceOptions: string[]): string[] {
  const normalizedValue = normalizeForComparison(value);

  return choiceOptions.filter((option) => {
    return !normalizedValue.includes(normalizeForComparison(option));
  });
}

function domToMarkdown(node: Node, context: { listDepth?: number; ordered?: boolean } = {}): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return cleanMarkdownText(node.textContent ?? "");
  }

  if (!(node instanceof HTMLElement)) {
    return Array.from(node.childNodes).map((child) => domToMarkdown(child, context)).join("");
  }

  const tagName = node.tagName.toLowerCase();
  const childMarkdown = () => Array.from(node.childNodes).map((child) => domToMarkdown(child, context)).join("");
  const blockMarkdown = () => childMarkdown().trim();

  switch (tagName) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = Number(tagName.slice(1));
      return `\n\n${"#".repeat(level)} ${blockMarkdown()}\n\n`;
    }
    case "p":
      return `\n\n${blockMarkdown()}\n\n`;
    case "br":
      return "\n";
    case "strong":
    case "b":
      return wrapInline(childMarkdown(), "**");
    case "em":
    case "i":
      return wrapInline(childMarkdown(), "*");
    case "code":
      if (node.closest("pre")) {
        return node.textContent ?? "";
      }
      return inlineCode(node.textContent ?? "");
    case "pre":
      return `\n\n\`\`\`\n${(node.textContent ?? "").trim()}\n\`\`\`\n\n`;
    case "a": {
      const href = node.getAttribute("href");
      const text = blockMarkdown();
      return href && text ? `[${text}](${href})` : text;
    }
    case "ul":
      return markdownList(node, false, context);
    case "ol":
      return markdownList(node, true, context);
    case "li":
      return blockMarkdown();
    case "blockquote":
      return `\n\n${blockMarkdown().split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
    case "table":
      return markdownTable(node);
    case "thead":
    case "tbody":
    case "tfoot":
    case "tr":
    case "th":
    case "td":
      return childMarkdown();
    default:
      if (isBlockElement(tagName)) {
        return `\n\n${blockMarkdown()}\n\n`;
      }

      return childMarkdown();
  }
}

function markdownList(element: HTMLElement, ordered: boolean, context: { listDepth?: number }): string {
  const depth = context.listDepth ?? 0;
  const items = Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName.toLowerCase() === "li");

  const lines = items.flatMap((item, index) => {
    const nestedLists = Array.from(item.children).filter((child): child is HTMLElement => {
      return child instanceof HTMLElement && ["ul", "ol"].includes(child.tagName.toLowerCase());
    });
    const itemClone = item.cloneNode(true) as HTMLElement;
    itemClone.querySelectorAll(":scope > ul, :scope > ol").forEach((node) => node.remove());

    const prefix = ordered ? `${index + 1}.` : "-";
    const indent = "  ".repeat(depth);
    const text = sanitizeMarkdown(domToMarkdown(itemClone, { listDepth: depth })).replace(/\n/g, `\n${indent}  `);
    const nested = nestedLists.map((list) => domToMarkdown(list, { listDepth: depth + 1 })).join("");

    return [`${indent}${prefix} ${text}`, nested.trimEnd()].filter(Boolean);
  });

  return `\n\n${lines.join("\n")}\n\n`;
}

function markdownTable(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll("tr")).map((row) => {
    return Array.from(row.querySelectorAll("th, td")).map((cell) => sanitizeMarkdown(domToMarkdown(cell)).replace(/\|/g, "\\|"));
  }).filter((cells) => cells.length > 0);

  if (rows.length === 0) {
    return "";
  }

  const [header, ...body] = rows;
  const separator = header.map(() => "---");
  const tableRows = [header, separator, ...body].map((row) => `| ${row.join(" | ")} |`);

  return `\n\n${tableRows.join("\n")}\n\n`;
}

function sanitizeMarkdown(value: string): string {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function sanitizeStepMarkdown(value: string): string {
  return sanitizeMarkdown(STEP_STATUS_PHRASES.reduce((text, phrase) => text.split(phrase).join(""), value));
}

function cleanMarkdownText(value: string): string {
  return value.replace(/\s+/g, " ");
}

function wrapInline(value: string, marker: string): string {
  const text = value.trim();

  return text ? `${marker}${text}${marker}` : "";
}

function inlineCode(value: string): string {
  const text = value.trim();
  const fence = text.includes("`") ? "``" : "`";

  return text ? `${fence}${text}${fence}` : "";
}

function isBlockElement(tagName: string): boolean {
  return [
    "article",
    "aside",
    "div",
    "figure",
    "figcaption",
    "main",
    "section",
  ].includes(tagName);
}

function extractCommentThreads(documentRef: Document): CommentThread[] {
  const rootWidgets = findRootThreadWidgets(documentRef);

  return uniqueElements(rootWidgets)
    .map(extractCommentThreadFromWidget)
    .filter((thread): thread is CommentThread => Boolean(thread));
}

function findRootThreadWidgets(documentRef: Document): HTMLElement[] {
  const discussionWidgets = Array.from(documentRef.querySelectorAll<HTMLElement>(".discussions__comment-widget")).filter((element) => {
    return isVisible(element) && !element.closest(".comments-card__replies");
  });

  if (discussionWidgets.length > 0) {
    return discussionWidgets;
  }

  return Array.from(documentRef.querySelectorAll<HTMLElement>(".comments-card")).filter((element) => {
    return isVisible(element) && !element.closest(".comments-card__replies");
  });
}

function extractCommentThreadFromWidget(widget: HTMLElement): CommentThread | undefined {
  const rootComment = findRootCommentElement(widget);
  if (!rootComment) {
    return undefined;
  }

  const root = extractCommentEntry(rootComment, { excludeReplies: true });
  if (!root) {
    return undefined;
  }

  const replies = uniqueElements(
    STEPIK_REPLY_SELECTORS.flatMap((selector) => Array.from(widget.querySelectorAll<HTMLElement>(selector))),
  )
    .map((replyElement) => findReplyCommentElement(replyElement) ?? replyElement)
    .map((replyElement) => extractCommentEntry(replyElement, { excludeReplies: false }))
    .filter((reply): reply is CommentEntry => Boolean(reply));

  return {
    root,
    replies: uniqueCommentEntries(replies),
  };
}

function findRootCommentElement(widget: HTMLElement): HTMLElement | undefined {
  return STEPIK_COMMENT_SELECTORS.flatMap((selector) => Array.from(widget.querySelectorAll<HTMLElement>(selector))).find(
    (element) => isVisible(element) && !element.closest(".comments-card__replies"),
  );
}

function findReplyCommentElement(replyElement: HTMLElement): HTMLElement | undefined {
  if (STEPIK_COMMENT_SELECTORS.some((selector) => replyElement.matches(selector))) {
    return replyElement;
  }

  return STEPIK_COMMENT_SELECTORS.flatMap((selector) => Array.from(replyElement.querySelectorAll<HTMLElement>(selector))).find(
    isVisible,
  );
}

function extractCommentEntry(commentElement: HTMLElement, options: { excludeReplies: boolean }): CommentEntry | undefined {
  const text = extractStructuredCommentText(commentElement, options);
  if (!isUsefulCommentText(text)) {
    return undefined;
  }

  return {
    text,
    author: findCommentMetadataText(commentElement, COMMENT_AUTHOR_SELECTORS, options),
    relativeTime: findCommentMetadataText(commentElement, COMMENT_DATE_SELECTORS, options),
    mentions: extractMentions(text),
  };
}

function extractStructuredCommentText(commentElement: HTMLElement, options: { excludeReplies: boolean }): string {
  const textNode = COMMENT_TEXT_SELECTORS.flatMap((selector) => Array.from(commentElement.querySelectorAll<HTMLElement>(selector))).find(
    (element) => isVisible(element) && (!options.excludeReplies || !element.closest(".comments-card__replies")),
  );

  if (textNode) {
    return sanitizeCommentText(cleanText(textNode.textContent));
  }

  const clone = commentElement.cloneNode(true) as HTMLElement;
  if (options.excludeReplies) {
    clone.querySelectorAll(".comments-card__replies").forEach((node) => node.remove());
  }
  clone.querySelectorAll(COMMENT_REMOVABLE_SELECTORS.join(",")).forEach((node) => node.remove());

  return sanitizeCommentText(cleanText(clone.textContent));
}

function findCommentMetadataText(commentElement: HTMLElement, selectors: string[], options: { excludeReplies: boolean }): string | undefined {
  const element = selectors.flatMap((selector) => Array.from(commentElement.querySelectorAll<HTMLElement>(selector))).find((candidate) => {
    return isVisible(candidate) && (!options.excludeReplies || !candidate.closest(".comments-card__replies")) && Boolean(cleanText(candidate.textContent));
  });

  return cleanText(element?.textContent) || undefined;
}

function flattenCommentThreads(commentThreads: CommentThread[]): string[] | undefined {
  if (commentThreads.length === 0) {
    return undefined;
  }

  return uniqueTexts(commentThreads.flatMap((thread) => [thread.root.text, ...thread.replies.map((reply) => reply.text)]));
}

function uniqueCommentEntries(entries: CommentEntry[]): CommentEntry[] {
  const seenTexts = new Set<string>();

  return entries.filter((entry) => {
    if (seenTexts.has(entry.text)) {
      return false;
    }

    seenTexts.add(entry.text);
    return true;
  });
}

function extractMentions(text: string): string[] {
  return uniqueTexts(Array.from(text.matchAll(/@[\p{L}\p{N}_-]+/gu)).map(([mention]) => mention));
}

function extractLooseComments(documentRef: Document): string[] {
  const textMatches = COMMENT_TEXT_SELECTORS.flatMap((selector) =>
    Array.from(documentRef.querySelectorAll<HTMLElement>(selector)),
  );

  const containerMatches = COMMENT_CONTAINER_SELECTORS.flatMap((selector) =>
    Array.from(documentRef.querySelectorAll<HTMLElement>(selector)),
  );

  const fallbackMatches = Array.from(documentRef.querySelectorAll<HTMLElement>("[class*='comment']")).filter((element) => {
    return element.children.length <= 5 && element.textContent !== null;
  });

  const candidates = uniqueTexts([...textMatches, ...containerMatches, ...fallbackMatches]
    .filter(isVisible)
    .map(extractCommentTextFromElement)
    .filter(isUsefulCommentText));

  return removeContainerDuplicates(candidates);
}

function extractCommentTextFromElement(element: HTMLElement): string {
  if (element.matches(COMMENT_REMOVABLE_SELECTORS.join(","))) {
    return "";
  }

  if (COMMENT_TEXT_SELECTORS.some((selector) => element.matches(selector))) {
    return sanitizeCommentText(cleanText(element.textContent));
  }

  const preciseChildText = findBestCommentTextChild(element);
  if (preciseChildText) {
    return preciseChildText;
  }

  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(COMMENT_REMOVABLE_SELECTORS.join(",")).forEach((node) => node.remove());

  return sanitizeCommentText(cleanText(clone.textContent));
}

function findBestCommentTextChild(element: HTMLElement): string | undefined {
  const candidates = COMMENT_TEXT_SELECTORS.flatMap((selector) => Array.from(element.querySelectorAll<HTMLElement>(selector)))
    .filter(isVisible)
    .map((candidate) => sanitizeCommentText(cleanText(candidate.textContent)))
    .filter(isUsefulCommentText)
    .sort((left, right) => right.length - left.length);

  return candidates[0];
}

function findFirstText(documentRef: Document, selectors: string[]): string | undefined {
  const element = findFirstVisibleElement(documentRef, selectors);
  const text = cleanText(element?.textContent);

  return text || undefined;
}

function findFirstVisibleElement(documentRef: Document, selectors: string[]): HTMLElement | undefined {
  for (const selector of selectors) {
    const element = Array.from(documentRef.querySelectorAll<HTMLElement>(selector)).find((candidate) => {
      return isVisible(candidate) && Boolean(cleanText(candidate.textContent));
    });

    if (element) {
      return element;
    }
  }

  return undefined;
}

function hasVisibleMatch(documentRef: Document, selectors: string[]): boolean {
  return countVisibleMatches(documentRef, selectors) > 0;
}

function countVisibleMatches(documentRef: Document, selectors: string[]): number {
  const matches = selectors.flatMap((selector) => Array.from(documentRef.querySelectorAll<HTMLElement>(selector)));

  return uniqueElements(matches).filter(isVisible).length;
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function sanitizeStepText(value: string): string {
  return STEP_STATUS_PHRASES.reduce((text, phrase) => text.split(phrase).join(""), value).replace(/\s+/g, " ").trim();
}

function isUsefulCommentText(value: string): boolean {
  const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();

  return (
    Boolean(normalized) &&
    !IGNORED_COMMENT_TEXTS.has(normalized) &&
    !COMMENT_METADATA_PATTERNS.some((pattern) => pattern.test(normalized)) &&
    !isLikelyAuthorName(value)
  );
}

function isLikelyAuthorName(value: string): boolean {
  const trimmed = value.trim();
  const words = trimmed.split(/\s+/);

  if (trimmed.length > 48 || words.length < 2 || words.length > 3 || /[!?.,:;()[\]{}0-9@]/.test(trimmed)) {
    return false;
  }

  return words.every((word) => /^[А-ЯЁA-Z][а-яёa-z-]+$/.test(word));
}

function sanitizeCommentText(value: string): string {
  return value
    .replace(new RegExp(`^anonymous\\s+\\d+\\s+${RELATIVE_TIME_PATTERN}\\s*`, "i"), "")
    .replace(new RegExp(`^${RELATIVE_TIME_PATTERN}\\s*`, "i"), "")
    .replace(/\s+\d*\s*ответить$/i, "")
    .replace(/\s+показать полностью$/i, "")
    .replace(/\s+скрыть$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueTexts(values: string[]): string[] {
  return Array.from(new Set(values));
}

function uniqueElements<T extends Element>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function removeContainerDuplicates(values: string[]): string[] {
  return values.filter((value) => {
    const normalized = normalizeForComparison(value);

    return !values.some((other) => {
      if (other === value || other.length < 20) {
        return false;
      }

      const normalizedOther = normalizeForComparison(other);

      return normalized.includes(normalizedOther) && normalized.length > normalizedOther.length + 20;
    });
  });
}

function normalizeForComparison(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

function removeEmptyValues<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== "")) as T;
}
