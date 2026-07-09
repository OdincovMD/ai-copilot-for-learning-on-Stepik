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

export function buildLearningRequest(
  currentStep: StepPayload,
  contextPack: ContextPack | undefined,
  mode: LearningMode = DEFAULT_LEARNING_MODE,
): LearningRequest {
  return {
    version: "learning-request-v1",
    mode,
    language: "ru",
    instruction: buildInstruction(currentStep, mode),
    guardrails: {
      noDirectAnswers: true,
      noMultipleChoiceOptionLeak: true,
      focusOnUnderstanding: true,
    },
    input: {
      currentStep: {
        url: currentStep.url,
        title: currentStep.title,
        markdown: currentStep.stepMarkdown,
        metadata: currentStep.metadata,
        task: currentStep.context.task,
      },
      previousSteps: (contextPack?.previousSteps ?? []).map((step) => ({
        url: step.url,
        title: step.title,
        markdown: step.stepMarkdown,
        metadata: step.metadata,
      })),
      comments: currentStep.comments,
      commentThreadsCount: currentStep.commentThreads.length,
    },
    expectedOutput: {
      summary: "2-4 предложения о смысле шага без готового ответа.",
      focusPoints: ["3-6 важных идей, ограничений или терминов."],
      commentInsights: ["2-5 выводов из комментариев, если сигнал достаточно сильный."],
      selfCheck: ["3-5 вопросов для самопроверки перед отправкой ответа."],
      needsMoreContext: "Короткая пометка, нужен ли дополнительный контекст.",
    },
  };
}

export function serializeLearningRequest(request: LearningRequest): string {
  return JSON.stringify(request, null, 2);
}

function buildInstruction(currentStep: StepPayload, mode: LearningMode): string {
  const baseInstruction = getModeInstruction(mode);
  const antiCheatingInstruction = getAntiCheatingInstruction(currentStep.context.task.kind);

  return [baseInstruction, antiCheatingInstruction].filter(Boolean).join(" ");
}

function getModeInstruction(mode: LearningMode): string {
  switch (mode) {
    case "explain":
      return "Объясни текущий шаг и ключевые идеи простым русским языком. Сфокусируйся на понимании, предпосылках и типичных ошибках.";
    case "hint":
      return "Дай обучающие подсказки по текущему шагу без готового решения. Помоги пользователю самому прийти к ответу через вопросы, проверки и ограничения.";
    case "notes":
      return "Подготовь краткий Markdown-конспект по текущему шагу и доступному предыдущему контексту. Сохрани структуру, термины и важные предупреждения.";
  }
}

function getAntiCheatingInstruction(kind: StepPayload["context"]["task"]["kind"]): string {
  if (kind === "choice") {
    return "Это тестовый шаг: не выбирай вариант ответа, не называй номер/букву/текст правильного варианта и не раскрывай прямой ответ.";
  }

  if (kind === "code") {
    return "Это шаг с кодом: не пиши финальное решение целиком и не выдавай готовую программу; объясняй подход, проверки и возможные ошибки.";
  }

  return "Не выдавай готовый ответ за пользователя; ответ должен помогать учиться, а не обходить задание.";
}
