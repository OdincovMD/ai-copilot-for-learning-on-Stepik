export type StepPayload = {
  url: string;
  title?: string;
  stepText: string;
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
  "Правильно.",
  "Неправильно.",
];

export function extractStepPayload(documentRef: Document = document): StepPayload {
  const metadata = {
    courseTitle: findFirstText(documentRef, COURSE_TITLE_SELECTORS),
    lessonTitle: findFirstText(documentRef, LESSON_TITLE_SELECTORS),
    stepTitle: findFirstText(documentRef, STEP_TITLE_SELECTORS),
  };
  const stepText = extractStepText(documentRef);
  const commentThreads = extractCommentThreads(documentRef);
  const comments = flattenCommentThreads(commentThreads) ?? extractLooseComments(documentRef);
  const title = cleanText(documentRef.title) || metadata.stepTitle;

  return {
    url: documentRef.location.href,
    title,
    stepText,
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

function extractStepText(documentRef: Document): string {
  const root = findFirstVisibleElement(documentRef, STEP_TEXT_SELECTORS) ?? documentRef.body;
  if (!root) {
    return "";
  }

  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(REMOVABLE_SELECTORS.join(",")).forEach((element) => element.remove());

  return sanitizeStepText(cleanText(clone.textContent));
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
