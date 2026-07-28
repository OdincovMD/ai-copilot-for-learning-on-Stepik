import type { LearningMode, LearningRequest } from "./learningRequest";

export type LearningAnalysis = {
  version: "learning-analysis-v1";
  mode: LearningMode;
  source: "local-mock" | "backend-mock" | "openai" | "groq" | "ollama";
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
      return `Объяснение для «${title}» строится ${contextPhrase}: mock показывает, какие идеи проверяет шаг, почему они важны и где легко ошибиться.`;
    case "hint":
      return `Подсказка для «${title}» строится ${contextPhrase}: mock дает направление размышления и следующий безопасный шаг без готового решения.`;
    case "notes":
      return `Конспект для «${title}» собирает ${contextPhrase}: mock фиксирует термины, правила и предупреждения в компактном формате для повторения.`;
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
      "Термины: выписать только понятия и обозначения, которые реально видны в шаге.",
      "Правила: сохранить условия применения и ограничения отдельными короткими пунктами.",
      "Ошибки: отделить факты из шага от комментариев и догадок.",
      ...basePoints.slice(1),
    ];
  }

  if (request.mode === "explain") {
    return [
      "Показать, какую идею проверяет шаг и зачем она нужна в теме урока.",
      "Разобрать причину типичной ошибки, не сопоставляя ее с конкретным вариантом ответа.",
      "Связать формулировку задания с предыдущим контекстом, если он есть.",
    ];
  }

  return [
    "Что именно спрашивает формулировка, если закрыть варианты ответа?",
    "Какие ограничения нужно проверить перед первым действием?",
    "Какой один следующий шаг продвинет рассуждение без спойлера?",
    ...basePoints.slice(1),
  ];
}

function buildCommentInsights(request: LearningRequest): string[] {
  if (request.input.comments.length === 0) {
    if (request.mode === "notes") {
      return ["Комментариев нет: в конспекте сохраняем только факты из шага и посещенный контекст."];
    }

    if (request.mode === "explain") {
      return ["Комментариев нет: объяснение опирается на формулировку шага и не добавляет чужие ошибки."];
    }

    return ["Комментариев нет: подсказка строится без ловушек из обсуждения."];
  }

  const threadsNote = request.input.commentThreadsCount > 0
    ? `Есть треды обсуждений: ${request.input.commentThreadsCount}; учитывать только устойчивые сигналы.`
    : "Треды ответов не обнаружены или не раскрыты в DOM.";

  if (request.mode === "notes") {
    return [
      `Комментарии: ${request.input.comments.length}; сохранить только повторяющиеся предупреждения и частые ошибки.`,
      threadsNote,
    ];
  }

  if (request.mode === "explain") {
    return [
      `Комментарии: ${request.input.comments.length}; использовать их как признаки мест, где стоит объяснить причину ошибки.`,
      threadsNote,
    ];
  }

  return [
    `Комментарии: ${request.input.comments.length}; превратить замеченные ловушки в вопросы самопроверки без спойлера.`,
    threadsNote,
  ];
}

function buildSelfCheck(request: LearningRequest): string[] {
  const taskKind = request.input.currentStep.task.kind;
  const checks = request.mode === "notes"
    ? [
      "Какие 2-3 термина из шага нужно повторить перед продолжением?",
      "Какие ограничения или условия применения стоит сохранить в конспекте?",
      "Что из комментариев является предупреждением, а что только частным мнением?",
    ]
    : request.mode === "explain"
      ? [
        "Могу ли я своими словами объяснить, какую идею проверяет шаг?",
        "Понимаю ли я причину ограничения в формулировке, а не только знакомые слова?",
        "Могу ли я объяснить типичную ошибку без выбора конкретного ответа?",
      ]
      : [
        "Что именно спрашивает шаг, если не смотреть на поле ответа?",
        "Какое ограничение формулировки нужно проверить первым?",
        "Не опираюсь ли я на feedback платформы вместо собственного рассуждения?",
      ];

  if (taskKind === "choice") {
    return [
      "Могу ли я обосновать свое рассуждение без номера, буквы или текста варианта?",
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

  if (taskKind === "text") {
    return [
      "Есть ли в моем ответе тезис, объяснение и проверяемый пример?",
      "Не заменяю ли я объяснение одной готовой фразой без рассуждения?",
      ...checks,
    ];
  }

  if (taskKind === "video") {
    return [
      "Какие вопросы остались после просмотра или видимого описания видео?",
      "Не делаю ли я выводы о видео, если его содержание не было доступно в DOM?",
      ...checks,
    ];
  }

  return checks;
}

function buildNeedsMoreContext(request: LearningRequest): string {
  if (request.input.previousSteps.length === 0) {
    if (request.mode === "notes") {
      return "Контекст ограничен текущим шагом: в конспект стоит добавить предыдущие определения урока.";
    }

    if (request.mode === "explain") {
      return "Контекст ограничен текущим шагом: объяснение станет точнее, если открыть предыдущие шаги урока.";
    }

    return "Контекст ограничен текущим шагом: подсказка остается общей, чтобы не додумывать недостающие условия.";
  }

  if (request.mode === "notes") {
    return "Для mock-конспекта достаточно текущего шага и посещенного контекста; backend позже сможет выделить связи точнее.";
  }

  if (request.mode === "explain") {
    return "Для mock-объяснения достаточно текущего шага и посещенного контекста; backend позже оценит пробелы точнее.";
  }

  return "Для mock-подсказки достаточно текущего шага и посещенного контекста; backend позже точнее выберет безопасный уровень подсказки.";
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
