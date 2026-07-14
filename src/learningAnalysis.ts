import type { LearningMode, LearningRequest } from "./learningRequest";

export type LearningAnalysis = {
  version: "learning-analysis-v1";
  mode: LearningMode;
  source: "local-mock" | "backend-mock" | "openai" | "ollama";
  summary: string;
  focusPoints: string[];
  commentInsights: string[];
  selfCheck: string[];
  needsMoreContext: string;
  warnings: string[];
};

export function buildMockLearningAnalysis(
  request: LearningRequest,
  source: LearningAnalysis["source"] = "local-mock",
): LearningAnalysis {
  const taskKind = request.input.currentStep.task.kind;

  return {
    version: "learning-analysis-v1",
    mode: request.mode,
    source,
    summary: buildSummary(request),
    focusPoints: buildFocusPoints(request),
    commentInsights: buildCommentInsights(request),
    selfCheck: buildSelfCheck(request),
    needsMoreContext: buildNeedsMoreContext(request),
    warnings: buildWarnings(taskKind),
  };
}

function buildSummary(request: LearningRequest): string {
  const title = request.input.currentStep.title || request.input.currentStep.metadata.stepTitle || "текущий шаг";
  const contextPhrase = request.input.previousSteps.length > 0
    ? `учитывая ${formatPreviousSteps(request.input.previousSteps.length)}`
    : "только по текущему видимому шагу";

  switch (request.mode) {
    case "explain":
      return `Mock-анализ объясняет «${title}» ${contextPhrase}. В настоящем AI-ответе здесь будет короткое объяснение смысла шага без готового решения.`;
    case "hint":
      return `Mock-подсказка для «${title}» строится ${contextPhrase}. Формат проверяет guidance: вопросы, ограничения и самопроверку вместо прямого ответа.`;
    case "notes":
      return `Mock-конспект для «${title}» собирает структуру текущего материала и доступный контекст. Реальный ответ позже превратит это в компактные Markdown-заметки.`;
  }
}

function formatPreviousSteps(count: number): string {
  return `${count} ${pluralizeRu(count, "предыдущий посещенный шаг", "предыдущих посещенных шага", "предыдущих посещенных шагов")}`;
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

function buildFocusPoints(request: LearningRequest): string[] {
  const basePoints = [
    "Сначала выделить формулировку задания и ограничения, а уже потом смотреть на варианты или поле ответа.",
    "Сравнить текущий шаг с предыдущим контекстом, если он есть, чтобы не терять связку урока.",
  ];

  if (request.mode === "notes") {
    return [
      "Сохранить определения и ключевые условия в виде коротких Markdown-пунктов.",
      "Отделить факты из шага от комментариев и догадок.",
      ...basePoints.slice(1),
    ];
  }

  if (request.mode === "explain") {
    return [
      "Объяснить, какие понятия проверяет шаг, не переходя к готовому ответу.",
      ...basePoints,
    ];
  }

  return [
    "Сформулировать 2-3 проверочных вопроса, которые подведут к решению без спойлера.",
    ...basePoints,
  ];
}

function buildCommentInsights(request: LearningRequest): string[] {
  if (request.input.comments.length === 0) {
    return ["Видимых комментариев нет, поэтому mock не делает выводов по обсуждению."];
  }

  return [
    `Видимых комментариев: ${request.input.comments.length}. В реальном анализе здесь будут только устойчивые сигналы, а не пересказ каждого сообщения.`,
    request.input.commentThreadsCount > 0
      ? `Есть треды обсуждений: ${request.input.commentThreadsCount}. Их нужно отличать от одиночных комментариев.`
      : "Треды ответов не обнаружены или не раскрыты в DOM.",
  ];
}

function buildSelfCheck(request: LearningRequest): string[] {
  const taskKind = request.input.currentStep.task.kind;
  const checks = [
    "Могу ли я своими словами объяснить, что спрашивает шаг?",
    "Проверил ли я ограничения формулировки, а не только знакомые слова?",
    "Не опираюсь ли я на feedback платформы вместо понимания материала?",
  ];

  if (taskKind === "choice") {
    return [
      "Могу ли я обосновать каждый выбранный и невыбранный вариант без подсказки?",
      ...checks,
    ];
  }

  if (taskKind === "code") {
    return [
      "Понимаю ли я общий алгоритм до написания кода?",
      "Есть ли у меня минимальные тестовые случаи для проверки решения?",
      ...checks,
    ];
  }

  return checks;
}

function buildNeedsMoreContext(request: LearningRequest): string {
  if (request.input.previousSteps.length === 0) {
    return "Контекст ограничен текущим шагом: для более сильного ответа стоит открыть предыдущие шаги урока.";
  }

  return "Для mock-ответа достаточно текущего шага и посещенного контекста; backend позже сможет оценивать необходимость контекста точнее.";
}

function buildWarnings(kind: LearningRequest["input"]["currentStep"]["task"]["kind"]): string[] {
  if (kind === "choice") {
    return ["Учебный режим: mock не выбирает вариант ответа и не раскрывает правильный выбор."];
  }

  if (kind === "code") {
    return ["Учебный режим: mock не пишет финальное решение целиком и не заменяет самостоятельную работу."];
  }

  return ["Mock-ответ локальный: он проверяет UX-форму результата, а не качество AI-анализа."];
}
