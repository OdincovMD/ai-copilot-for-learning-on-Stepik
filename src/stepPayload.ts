export type StepPayload = {
  url: string;
  title?: string;
  stepText: string;
  comments: string[];
  metadata: {
    courseTitle?: string;
    lessonTitle?: string;
    stepTitle?: string;
  };
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

const COMMENT_SELECTORS = [
  "[data-qa='comment']",
  "[data-qa='comment-text']",
  "[class*='comment'] [class*='text']",
  "[class*='discussion'] [class*='text']",
  ".comments__comment",
  ".comment__text",
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
]);

const COMMENT_METADATA_PATTERNS = [
  /^anonymous\s+\d+$/i,
  /^anonymous\s+\d+\s+\d+\s+\S+\s+назад$/i,
  /^\d+\s+(секунд[уы]?|минут[уы]?|час(?:а|ов)?|дн(?:я|ей)?|недел[яьиь]|месяц(?:а|ев)?|год(?:а|лет)?)\s+назад$/i,
  /^\d+\s+ответить$/i,
];

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

  return {
    url: documentRef.location.href,
    title: cleanText(documentRef.title) || metadata.stepTitle,
    stepText: extractStepText(documentRef),
    comments: extractComments(documentRef),
    metadata: removeEmptyValues(metadata),
  };
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

function extractComments(documentRef: Document): string[] {
  const selectorMatches = COMMENT_SELECTORS.flatMap((selector) =>
    Array.from(documentRef.querySelectorAll<HTMLElement>(selector)),
  );

  const fallbackMatches = Array.from(documentRef.querySelectorAll<HTMLElement>("[class*='comment']")).filter(
    (element) => element.children.length <= 3,
  );

  const candidates = uniqueTexts([...selectorMatches, ...fallbackMatches]
    .filter(isVisible)
    .map((element) => cleanText(element.textContent))
    .filter(isUsefulCommentText));

  return removeContainerDuplicates(candidates);
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
    !COMMENT_METADATA_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

function uniqueTexts(values: string[]): string[] {
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

function removeEmptyValues<T extends Record<string, string | undefined>>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => Boolean(value))) as T;
}
