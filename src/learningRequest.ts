import type { ContextPack } from "./contextPack";
import type { StepPayload } from "./stepPayload";

export type LearningMode = "explain" | "hint" | "notes";

export type LearningRequest = {
  version: "learning-request-v1";
  mode: LearningMode;
  language: "ru";
  instruction: string;
  guardrails: {
    noDirectAnswers: true;
    noMultipleChoiceOptionLeak: true;
    focusOnUnderstanding: true;
  };
  input: {
    currentStep: {
      url: string;
      title?: string;
      markdown: string;
      metadata: StepPayload["metadata"];
      task: StepPayload["context"]["task"];
    };
    previousSteps: Array<{
      url: string;
      title?: string;
      markdown: string;
      metadata: StepPayload["metadata"];
    }>;
    comments: string[];
    commentThreadsCount: number;
  };
  expectedOutput: {
    summary: string;
    focusPoints: string[];
    commentInsights: string[];
    selfCheck: string[];
    needsMoreContext: string;
  };
};

export const DEFAULT_LEARNING_MODE: LearningMode = "hint";

export const LEARNING_MODE_LABELS: Record<LearningMode, string> = {
  explain: "Объяснить",
  hint: "Подсказка",
  notes: "Конспект",
};

const LEARNING_REQUEST_LIMITS = {
  maxCurrentStepMarkdownChars: 12_000,
  maxPreviousSteps: 5,
  maxPreviousStepMarkdownChars: 6_000,
  maxComments: 40,
  maxCommentChars: 1_200,
  maxTotalRequestChars: 32_000,
} as const;

export function buildLearningRequest(
  currentStep: StepPayload,
  contextPack: ContextPack | undefined,
  mode: LearningMode = DEFAULT_LEARNING_MODE,
): LearningRequest {
  const instruction = buildInstruction(currentStep, mode);
  const boundedInput = buildBoundedLearningInput(currentStep, contextPack, instruction.length);

  return {
    version: "learning-request-v1",
    mode,
    language: "ru",
    instruction,
    guardrails: {
      noDirectAnswers: true,
      noMultipleChoiceOptionLeak: true,
      focusOnUnderstanding: true,
    },
    input: boundedInput,
    expectedOutput: {
      summary: getModeSummaryContract(mode),
      focusPoints: getModeFocusPointsContract(mode),
      commentInsights: getModeCommentInsightsContract(mode),
      selfCheck: getModeSelfCheckContract(mode),
      needsMoreContext: getModeContextContract(mode),
    },
  };
}

export function serializeLearningRequest(request: LearningRequest): string {
  return JSON.stringify(request, null, 2);
}

function buildInstruction(currentStep: StepPayload, mode: LearningMode): string {
  const baseInstruction = getModeInstruction(mode);
  const taskPolicyInstruction = getTaskPolicyInstruction(currentStep.context.task.kind);
  const antiCheatingInstruction = getAntiCheatingInstruction(currentStep.context.task.kind);

  return [baseInstruction, taskPolicyInstruction, antiCheatingInstruction].filter(Boolean).join(" ");
}

function buildBoundedLearningInput(
  currentStep: StepPayload,
  contextPack: ContextPack | undefined,
  instructionLength: number,
): LearningRequest["input"] {
  let remainingTextBudget = Math.max(0, LEARNING_REQUEST_LIMITS.maxTotalRequestChars - instructionLength);
  const currentMarkdown = takeFromBudget(
    currentStep.stepMarkdown,
    Math.min(LEARNING_REQUEST_LIMITS.maxCurrentStepMarkdownChars, remainingTextBudget),
  );
  remainingTextBudget -= currentMarkdown.length;

  const previousSteps: LearningRequest["input"]["previousSteps"] = [];
  for (const step of (contextPack?.previousSteps ?? []).slice(0, LEARNING_REQUEST_LIMITS.maxPreviousSteps)) {
    if (remainingTextBudget <= 0) {
      break;
    }

    const markdown = takeFromBudget(
      step.stepMarkdown,
      Math.min(LEARNING_REQUEST_LIMITS.maxPreviousStepMarkdownChars, remainingTextBudget),
    );
    remainingTextBudget -= markdown.length;
    previousSteps.push({
      url: step.url,
      title: step.title,
      markdown,
      metadata: step.metadata,
    });
  }

  const comments: string[] = [];
  for (const comment of currentStep.comments.slice(0, LEARNING_REQUEST_LIMITS.maxComments)) {
    if (remainingTextBudget <= 0) {
      break;
    }

    const boundedComment = takeFromBudget(
      comment,
      Math.min(LEARNING_REQUEST_LIMITS.maxCommentChars, remainingTextBudget),
    );
    remainingTextBudget -= boundedComment.length;
    comments.push(boundedComment);
  }

  return {
    currentStep: {
      url: currentStep.url,
      title: currentStep.title,
      markdown: currentMarkdown,
      metadata: currentStep.metadata,
      task: currentStep.context.task,
    },
    previousSteps,
    comments,
    commentThreadsCount: currentStep.commentThreads.length,
  };
}

function takeFromBudget(value: string, maxCharacters: number): string {
  if (maxCharacters <= 0) {
    return "";
  }

  if (value.length <= maxCharacters) {
    return value;
  }

  return value.slice(0, maxCharacters).trimEnd();
}

function getModeInstruction(mode: LearningMode): string {
  switch (mode) {
    case "explain":
      return (
        "Режим EXPLAIN. Сценарий: цельное объяснение. Объясни текущий шаг простым русским языком: что проверяется, какие идеи нужны, почему это важно и где обычно путаются. "
        + "Не превращай ответ в набор подсказок к выбору варианта и не делай конспект; приоритет — понимание причин, понятий и типичных ошибок."
      );
    case "hint":
      return (
        "Режим HINT. Сценарий: безопасная подсказка. Дай вопросы, проверки, ограничения и один следующий шаг без готового решения. "
        + "Не объясняй всю тему за пользователя и не делай конспект; приоритет — помочь самому дойти до ответа."
      );
    case "notes":
      return (
        "Режим NOTES. Сценарий: компактный конспект. Подготовь учебные заметки: структура шага, термины, формулы/правила, важные предупреждения и связь с контекстом. "
        + "Не веди пользователя вопросами как в подсказке и не растягивай объяснение; приоритет — компактные заметки для повторения."
      );
  }
}

function getModeSummaryContract(mode: LearningMode): string {
  switch (mode) {
    case "explain":
      return "2-4 предложения: цельно объясни смысл шага, проверяемые идеи и причинную связь без готового ответа.";
    case "hint":
      return "1-2 предложения: задай направление размышления, границы задачи и следующий безопасный шаг, не раскрывая итоговый ответ.";
    case "notes":
      return "1-2 предложения: дай заголовочную выжимку конспекта, что стоит сохранить в памяти для повторения.";
  }
}

function getModeFocusPointsContract(mode: LearningMode): string[] {
  switch (mode) {
    case "explain":
      return [
        "3-5 пунктов с объяснением понятий, причин, предпосылок и типичных ошибок.",
        "Каждый пункт должен отвечать на вопрос 'почему это важно для понимания?'.",
      ];
    case "hint":
      return [
        "3-5 пунктов-подсказок в форме вопросов, проверок, ограничений или следующего шага.",
        "Не раскрывать финальный ответ, правильный вариант или готовый код.",
      ];
    case "notes":
      return [
        "3-6 коротких конспектных пунктов: термины, правила, структура, ограничения.",
        "Писать как заметки для повторения, а не как диалоговые подсказки.",
      ];
  }
}

function getModeCommentInsightsContract(mode: LearningMode): string[] {
  switch (mode) {
    case "explain":
      return ["2-4 вывода: какие места из комментариев указывают на непонимание темы и как это объяснить обобщенно."];
    case "hint":
      return ["2-4 вывода: какие ловушки из комментариев превратить в вопросы самопроверки без спойлера."];
    case "notes":
      return ["2-4 коротких заметки: какие предупреждения или частые ошибки из комментариев стоит запомнить."];
  }
}

function getModeSelfCheckContract(mode: LearningMode): string[] {
  switch (mode) {
    case "explain":
      return ["3-5 вопросов: проверить, понял ли пользователь идею, термин или ограничение шага."];
    case "hint":
      return ["3-5 вопросов: пошагово проверить собственное рассуждение перед ответом, без подсказки правильного варианта."];
    case "notes":
      return ["3-5 пунктов: что повторить или сверить по конспекту перед продолжением курса."];
  }
}

function getModeContextContract(mode: LearningMode): string {
  switch (mode) {
    case "explain":
      return "Коротко: какой контекст нужен, чтобы объяснение стало точнее.";
    case "hint":
      return "Коротко: достаточно ли контекста для безопасной подсказки без спойлера.";
    case "notes":
      return "Коротко: какие соседние шаги или термины стоит добавить в конспект.";
  }
}

function getTaskPolicyInstruction(kind: StepPayload["context"]["task"]["kind"]): string {
  if (kind === "choice") {
    return "Формат ответа для теста: сначала объясни проверяемый принцип, затем дай 2-4 нейтральных вопроса для исключения неверных рассуждений без разбора конкретных вариантов.";
  }

  if (kind === "code") {
    return "Формат ответа для кода: дай план решения, инварианты, крайние случаи и идеи тестов; допускаются короткие псевдошаги, но не полный финальный код.";
  }

  if (kind === "text") {
    return "Формат ответа для текстового ответа: помоги сформулировать критерии хорошего ответа, структуру рассуждения и проверку полноты, не подставляя готовую формулировку.";
  }

  if (kind === "video") {
    return "Формат ответа для видео: делай конспект и вопросы только по видимому тексту страницы и доступному контексту; честно отметь, если содержания видео нет в DOM.";
  }

  return "Формат ответа: адаптируй подсказку к видимому типу задания и явно отделяй факты из страницы от предположений.";
}

function getAntiCheatingInstruction(kind: StepPayload["context"]["task"]["kind"]): string {
  if (kind === "choice") {
    return (
      "Это тестовый шаг: не выбирай вариант ответа, не называй номер/букву/текст правильного варианта и не раскрывай прямой ответ. "
      + "Не перечисляй и не переформулируй все варианты из списка; не сопоставляй термины из вариантов с их определениями. "
      + "Объясняй тему обобщенно, через принцип, типичные ловушки и вопросы для самопроверки."
    );
  }

  if (kind === "code") {
    return "Это шаг с кодом: не пиши финальное решение целиком и не выдавай готовую программу; объясняй подход, проверки и возможные ошибки.";
  }

  return "Не выдавай готовый ответ за пользователя; ответ должен помогать учиться, а не обходить задание.";
}
