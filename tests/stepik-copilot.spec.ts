import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  buildContextPackFromCache,
  CONTEXT_STORAGE_KEY,
  createContextStepSnapshot,
  createStepCacheKey,
  type StepCache,
} from "../src/contextPack";
import { buildMockLearningAnalysis } from "../src/learningAnalysis";
import {
  buildLearningRequest,
  DEFAULT_LEARNING_MODE,
  serializeLearningRequest,
  type LearningMode,
  type LearningRequest,
} from "../src/learningRequest";
import type { LearningAnalysis } from "../src/learningAnalysis";
import type { StepPayload } from "../src/stepPayload";

const DIST_CONTENT_SCRIPT = path.resolve("dist/content.js");
const STEPIK_STEP_URL = "https://stepik.org/lesson/1492667/step/5?unit=1512554";
const BACKEND_URL = getEnvValue("VITE_BACKEND_URL");
if (!BACKEND_URL) {
  throw new Error("VITE_BACKEND_URL must be set for Playwright tests");
}
const BACKEND_ANALYZE_URL = `${BACKEND_URL}/analyze-step`;

function getEnvValue(name: string): string | undefined {
  return process.env[name] ?? readEnvValue(".env", name) ?? readEnvValue(".env.example", name);
}

function readEnvValue(filePath: string, name: string): string | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (key !== name) {
      continue;
    }

    return trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
  }

  return undefined;
}

function createMockStepPayload(options: {
  lessonId?: string;
  stepPosition: string;
  unitId?: string;
  stepMarkdown?: string;
  title?: string;
  comments?: string[];
  kind?: StepPayload["context"]["task"]["kind"];
}): StepPayload {
  const lessonId = options.lessonId ?? "100";
  const stepMarkdown = options.stepMarkdown ?? `Материал шага ${options.stepPosition}`;
  const kind = options.kind ?? "unknown";
  const comments = options.comments ?? [];

  return {
    url: `https://stepik.org/lesson/${lessonId}/step/${options.stepPosition}?unit=${options.unitId ?? `u${options.stepPosition}`}`,
    title: options.title ?? `Шаг ${options.stepPosition}`,
    stepText: stepMarkdown,
    stepMarkdown,
    stepContent: {
      format: "markdown",
      markdown: stepMarkdown,
      plainText: stepMarkdown,
    },
    comments,
    commentThreads: [],
    metadata: {
      courseTitle: "Тестовый курс",
      lessonTitle: "Тестовый урок",
      stepTitle: `Шаг ${options.stepPosition}`,
    },
    context: {
      ids: {
        lessonId,
        stepPosition: options.stepPosition,
        unitId: options.unitId,
      },
      page: {
        hostname: "stepik.org",
        path: `/lesson/${lessonId}/step/${options.stepPosition}`,
        language: "ru",
      },
      task: {
        kind,
        hasAnswerControls: kind === "choice" || kind === "code",
        hasChoiceOptions: kind === "choice",
        hasCodeEditor: kind === "code",
      },
      stats: {
        stepTextLength: stepMarkdown.length,
        commentsCount: comments.length,
        commentThreadsCount: 0,
        repliesCount: 0,
        collectedAt: "2026-07-09T00:00:00.000Z",
        extractionVersion: "dom-v2",
      },
    },
  };
}

function createStepCache(payloads: StepPayload[]): StepCache {
  return Object.fromEntries(
    payloads.map((payload, index) => {
      return [createStepCacheKey(payload), createContextStepSnapshot(payload, `2026-07-09T00:00:0${index}.000Z`)];
    }),
  );
}

test("uses Stepik document title metadata when lesson DOM text is comments noise", async ({ page }) => {
  const currentUrl = "https://stepik.org/lesson/265081/step/3?unit=246030";
  const payloadPromise = page.waitForEvent("console", async (message) => {
    const [prefix] = message.args();

    return (await prefix?.jsonValue()) === "[Stepik Copilot DOM Prototype]";
  });

  await page.route(currentUrl, async (route) => {
    await route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `
        <!doctype html>
        <html lang="ru">
          <head>
            <title>"Поколение Python": курс для начинающих: урок Выбор из двух, шаг 3 — Stepik</title>
            <style>
              .lesson-title, .step-inner__text { display: block; }
            </style>
          </head>
          <body>
            <main>
              <a class="lesson-title" href="/lesson/265081/step/3">Комментариев</a>
              <section class="step-inner__text"><h2>Частые ошибки</h2></section>
            </main>
          </body>
        </html>
      `,
    });
  });
  await page.goto(currentUrl);
  await page.addScriptTag({ path: DIST_CONTENT_SCRIPT });

  const message = await payloadPromise;
  const [, payloadHandle] = message.args();
  const payload = await payloadHandle.jsonValue() as StepPayload;

  expect(payload.metadata.courseTitle).toBe("\"Поколение Python\": курс для начинающих");
  expect(payload.metadata.lessonTitle).toBe("Выбор из двух");
  expect(payload.metadata.stepTitle).toBe("Частые ошибки");
});

test("builds an empty context pack for the first visited step", () => {
  const currentStep = createMockStepPayload({ stepPosition: "1" });
  const contextPack = buildContextPackFromCache(currentStep, {});

  expect(contextPack.previousSteps).toEqual([]);
  expect(contextPack.source).toBe("visited-cache");
  expect(contextPack.stats).toMatchObject({
    totalVisitedInLesson: 0,
    includedPreviousSteps: 0,
    truncated: false,
  });
});

test("includes previous visited steps from the same lesson only", () => {
  const previousStep = createMockStepPayload({ lessonId: "100", stepPosition: "1" });
  const otherLessonStep = createMockStepPayload({ lessonId: "200", stepPosition: "1" });
  const currentStep = createMockStepPayload({ lessonId: "100", stepPosition: "2" });
  const contextPack = buildContextPackFromCache(currentStep, createStepCache([previousStep, otherLessonStep]));

  expect(contextPack.previousSteps.map((step) => step.context.ids.stepPosition)).toEqual(["1"]);
  expect(contextPack.previousSteps[0]).not.toHaveProperty("comments");
  expect(contextPack.previousSteps[0]).not.toHaveProperty("commentThreads");
});

test("limits previous steps by nearest step positions", () => {
  const visitedSteps = ["1", "2", "3", "4"].map((stepPosition) => createMockStepPayload({ stepPosition }));
  const currentStep = createMockStepPayload({ stepPosition: "5" });
  const contextPack = buildContextPackFromCache(currentStep, createStepCache(visitedSteps), {
    maxPreviousSteps: 2,
    maxCharacters: 10_000,
  });

  expect(contextPack.previousSteps.map((step) => step.context.ids.stepPosition)).toEqual(["3", "4"]);
  expect(contextPack.stats.truncated).toBe(true);
});

test("limits previous step markdown by max characters", () => {
  const previousStep = createMockStepPayload({
    stepPosition: "2",
    stepMarkdown: "0123456789ABCDEFGHIJ",
  });
  const currentStep = createMockStepPayload({ stepPosition: "3" });
  const contextPack = buildContextPackFromCache(currentStep, createStepCache([previousStep]), {
    maxPreviousSteps: 5,
    maxCharacters: 10,
  });

  expect(contextPack.previousSteps).toHaveLength(1);
  expect(contextPack.previousSteps[0].stepMarkdown).toBe("0123456789");
  expect(contextPack.stats.truncated).toBe(true);
});

test("builds a learning request with current step, previous steps, and comments", () => {
  const previousStep = createMockStepPayload({ stepPosition: "1", stepMarkdown: "## Предыдущий шаг" });
  const currentStep = createMockStepPayload({
    stepPosition: "2",
    stepMarkdown: "## Текущий шаг\n\nМатериал для объяснения.",
    comments: ["Первый полезный комментарий", "Второй комментарий"],
  });
  const contextPack = buildContextPackFromCache(currentStep, createStepCache([previousStep, currentStep]));
  const request = buildLearningRequest(currentStep, contextPack, "explain");

  expect(request).toMatchObject({
    version: "learning-request-v1",
    mode: "explain",
    language: "ru",
    guardrails: {
      noDirectAnswers: true,
      noMultipleChoiceOptionLeak: true,
      focusOnUnderstanding: true,
    },
  });
  expect(request.input.currentStep.markdown).toContain("Текущий шаг");
  expect(request.input.previousSteps).toHaveLength(1);
  expect(request.input.previousSteps[0].markdown).toContain("Предыдущий шаг");
  expect(request.input.comments).toEqual(["Первый полезный комментарий", "Второй комментарий"]);
  expect(serializeLearningRequest(request)).toContain('"version": "learning-request-v1"');
});

test("builds a learning request without comments", () => {
  const currentStep = createMockStepPayload({ stepPosition: "1", comments: [] });
  const request = buildLearningRequest(currentStep, undefined, DEFAULT_LEARNING_MODE);

  expect(request.input.comments).toEqual([]);
  expect(request.input.previousSteps).toEqual([]);
  expect(request.input.commentThreadsCount).toBe(0);
});

test("strengthens guardrails for choice steps", () => {
  const currentStep = createMockStepPayload({ stepPosition: "3", kind: "choice" });
  const request = buildLearningRequest(currentStep, undefined, "hint");

  expect(request.guardrails.noDirectAnswers).toBe(true);
  expect(request.guardrails.noMultipleChoiceOptionLeak).toBe(true);
  expect(request.instruction).toContain("не выбирай вариант ответа");
  expect(request.instruction).toContain("не раскрывай прямой ответ");
});

test("uses hint mode without asking for a final solution", () => {
  const currentStep = createMockStepPayload({ stepPosition: "4", kind: "code" });
  const request = buildLearningRequest(currentStep, undefined, "hint");

  expect(request.mode).toBe("hint" satisfies LearningMode);
  expect(request.instruction).toContain("без готового решения");
  expect(request.instruction).toContain("не пиши финальное решение целиком");
});

test("builds a stable mock learning analysis", () => {
  const currentStep = createMockStepPayload({
    stepPosition: "5",
    title: "Тестовый шаг",
    stepMarkdown: "## Тестовый шаг\n\nРазберите условие.",
    comments: ["Комментарий с частой ошибкой"],
  });
  const request = buildLearningRequest(currentStep, undefined, "explain");
  const analysis = buildMockLearningAnalysis(request);

  expect(analysis).toMatchObject({
    version: "learning-analysis-v1",
    mode: "explain",
    source: "local-mock",
  });
  expect(analysis.summary).toContain("Тестовый шаг");
  expect(analysis.focusPoints.length).toBeGreaterThan(0);
  expect(analysis.commentInsights.join(" ")).toContain("1");
  expect(analysis.selfCheck.length).toBeGreaterThan(0);
});

test("builds graceful mock comment insights without comments", () => {
  const currentStep = createMockStepPayload({ stepPosition: "1", comments: [] });
  const request = buildLearningRequest(currentStep, undefined, DEFAULT_LEARNING_MODE);
  const analysis = buildMockLearningAnalysis(request);

  expect(analysis.commentInsights).toEqual(["Видимых комментариев нет, поэтому mock не делает выводов по обсуждению."]);
  expect(analysis.needsMoreContext).toContain("Контекст ограничен текущим шагом");
});

test("does not produce direct answers for choice mock analysis", () => {
  const currentStep = createMockStepPayload({
    stepPosition: "2",
    kind: "choice",
    stepMarkdown: [
      "Выберите все подходящие ответы из списка",
      "",
      "Варианты:",
      "",
      "- платформонезависимость",
      "- простота",
    ].join("\n"),
  });
  const request = buildLearningRequest(currentStep, undefined, "hint");
  const analysis = buildMockLearningAnalysis(request);
  const serialized = JSON.stringify(analysis).toLowerCase();

  expect(analysis.warnings.join(" ")).toContain("не выбирает вариант ответа");
  expect(serialized).not.toContain("правильный вариант");
  expect(serialized).not.toContain("ответ: платформонезависимость");
});

test("does not produce final code solution for code mock analysis", () => {
  const currentStep = createMockStepPayload({
    stepPosition: "3",
    kind: "code",
    stepMarkdown: "Напишите программу для обработки списка.",
  });
  const request = buildLearningRequest(currentStep, undefined, "hint");
  const analysis = buildMockLearningAnalysis(request);
  const serialized = JSON.stringify(analysis).toLowerCase();

  expect(analysis.warnings.join(" ")).toContain("не пишет финальное решение целиком");
  expect(serialized).not.toContain("готовая программа");
  expect(serialized).not.toContain("финальный код");
});

test("extracts meaningful Stepik comments without metadata duplicates", async ({ page }) => {
  const payloadPromise = page.waitForEvent("console", async (message) => {
    const [prefix] = message.args();

    return (await prefix?.jsonValue()) === "[Stepik Copilot DOM Prototype]";
  });

  await page.route(STEPIK_STEP_URL, async (route) => {
    await route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `
    <!doctype html>
    <html lang="ru">
      <head>
        <title>Python для собеседования: урок Тест: Обход Списков, шаг 5 — Stepik</title>
        <style>
          body { margin: 0; font-family: sans-serif; }
          .course-title, .lesson-title, .step-inner__text, .comments__comment { display: block; }
          .comments__comment { margin: 16px 0; }
        </style>
      </head>
      <body>
        <header><a class="course-title" href="/course/123">Python для собеседования</a></header>
        <main>
          <h1 class="lesson-title">5.2 Тест: Списки</h1>
          <section class="step-inner__text">Выберите один вариант из списка</section>
          <section class="attempt">
            <label><input type="radio" name="answer" /> 1</label>
            <label><input type="radio" name="answer" /> 5</label>
            <label><input type="radio" name="answer" /> 2</label>
            <label><input type="radio" name="answer" /> 3</label>
          </section>
          <section class="comments">
            <article class="comments__comment">
              <div class="comment__header">
                <span class="comment__author">Anonymous 919256933</span>
                <span class="comment__date">6 месяцев назад</span>
              </div>
              <div class="comment__text">Вообще-то, ни сколько, если только не поставить pass в теле цикла!</div>
              <button type="button">Ответить</button>
            </article>
            <article class="comments__comment">
              <div class="comment__header">
                <span class="comment__author">Anonymous 725861288</span>
                <span class="comment__date">5 месяцев назад</span>
              </div>
              <div class="comment__text">Здесь нет правильного ответа, поправьте условие.</div>
              <button type="button">Ответить</button>
            </article>
            <button type="button">Оставить комментарий</button>
            <div class="comment__text">30 минут и прокси в телеграмм и стабильный VPN (на ПК) настроил, едем дальше.</div>
            <div class="comment__text">не получается, ввожу в поиске @BotFather и выскакивает множество чужих ботов. как свой сделать?</div>
            <div class="comment__text">Хорошее объяснение!</div>
            <div class="comment__text">Ясно, коротко, красиво! Однозначно лайк!</div>
            <div class="comments__meta">Сергей Конопацкий</div>
            <div class="comments__meta">позавчера</div>
            <div class="comments__meta">Гомзяков Вадим</div>
            <div class="comments__meta">Посмотреть 1 ответ</div>
            <div class="comments__meta">Ольга Золотых</div>
            <div class="comments__meta">Ильдар Киямов</div>
          </section>
        </main>
      </body>
    </html>
      `,
    });
  });
  await page.goto(STEPIK_STEP_URL);
  await page.addScriptTag({ path: DIST_CONTENT_SCRIPT });

  const message = await payloadPromise;
  const [, payloadHandle] = message.args();
  const payload = await payloadHandle.jsonValue() as {
    stepText: string;
    stepMarkdown: string;
    stepContent: {
      format: string;
      markdown: string;
      plainText: string;
    };
    comments: string[];
    commentThreads: Array<{
      root: {
        author?: string;
        relativeTime?: string;
        text: string;
        mentions: string[];
      };
      replies: Array<{
        author?: string;
        relativeTime?: string;
        text: string;
        mentions: string[];
      }>;
    }>;
    metadata: {
      courseTitle?: string;
      lessonTitle?: string;
    };
    context: {
      ids: {
        lessonId?: string;
        stepPosition?: string;
        unitId?: string;
      };
      task: {
        kind: string;
        hasAnswerControls: boolean;
        answerOptionsCount?: number;
      };
      stats: {
        extractionVersion: string;
      };
    };
  };

  expect(payload.stepText).toBe("Выберите один вариант из списка 1 5 2 3");
  expect(payload.stepMarkdown).toBe([
    "Выберите один вариант из списка",
    "",
    "Варианты:",
    "",
    "- 1",
    "- 5",
    "- 2",
    "- 3",
  ].join("\n"));
  expect(payload.stepContent).toMatchObject({
    format: "markdown",
    markdown: payload.stepMarkdown,
    plainText: "Выберите один вариант из списка 1 5 2 3",
  });
  expect(payload.metadata.courseTitle).toBe("Python для собеседования");
  expect(payload.metadata.lessonTitle).toBe("5.2 Тест: Списки");
  expect(payload.comments).toEqual([
    "Вообще-то, ни сколько, если только не поставить pass в теле цикла!",
    "Здесь нет правильного ответа, поправьте условие.",
    "30 минут и прокси в телеграмм и стабильный VPN (на ПК) настроил, едем дальше.",
    "не получается, ввожу в поиске @BotFather и выскакивает множество чужих ботов. как свой сделать?",
    "Хорошее объяснение!",
    "Ясно, коротко, красиво! Однозначно лайк!",
  ]);
  expect(payload.context.ids).toMatchObject({
    lessonId: "1492667",
    stepPosition: "5",
    unitId: "1512554",
  });
  expect(payload.context.task).toMatchObject({
    kind: "choice",
    hasAnswerControls: true,
    answerOptionsCount: 4,
  });
  expect(payload.context.stats.extractionVersion).toBe("dom-v2");
});

test("extracts visible multiple choice assignment options without success feedback", async ({ page }) => {
  const payloadPromise = page.waitForEvent("console", async (message) => {
    const [prefix] = message.args();

    return (await prefix?.jsonValue()) === "[Stepik Copilot DOM Prototype]";
  });

  await page.setContent(`
    <!doctype html>
    <html lang="ru">
      <head>
        <title>Multiple choice Stepik mock</title>
        <style>
          .lesson-step, .attempt, label, .attempt__feedback { display: block; }
          label { margin: 6px 0; }
        </style>
      </head>
      <body>
        <main>
          <section class="lesson-step">
            <div class="step-inner__text">Выберите все подходящие ответы из списка</div>
            <form class="attempt">
              <div class="attempt__feedback">Прекрасный ответ.</div>
              <label><input type="checkbox" name="answer" /> платформонезависимость</label>
              <label><input type="checkbox" name="answer" /> встраиваемость</label>
              <label><input type="checkbox" name="answer" /> простота</label>
              <label><input type="checkbox" name="answer" /> наличие большой библиотеки классов</label>
              <label><input type="checkbox" name="answer" /> динамическая типизация (для несложных программ)</label>
            </form>
          </section>
        </main>
      </body>
    </html>
  `);
  await page.addScriptTag({ path: DIST_CONTENT_SCRIPT });

  const message = await payloadPromise;
  const [, payloadHandle] = message.args();
  const payload = await payloadHandle.jsonValue() as {
    stepText: string;
    stepMarkdown: string;
    context: {
      task: {
        kind: string;
        answerOptionsCount?: number;
      };
    };
  };

  expect(payload.stepText).toBe([
    "Выберите все подходящие ответы из списка",
    "платформонезависимость",
    "встраиваемость",
    "простота",
    "наличие большой библиотеки классов",
    "динамическая типизация (для несложных программ)",
  ].join(" "));
  expect(payload.stepText).not.toContain("Прекрасный ответ");
  expect(payload.stepMarkdown).toBe([
    "Выберите все подходящие ответы из списка",
    "",
    "Варианты:",
    "",
    "- платформонезависимость",
    "- встраиваемость",
    "- простота",
    "- наличие большой библиотеки классов",
    "- динамическая типизация (для несложных программ)",
  ].join("\n"));
  expect(payload.context.task).toMatchObject({
    kind: "choice",
    answerOptionsCount: 5,
  });
});

test("preserves formatted step content as markdown", async ({ page }) => {
  const payloadPromise = page.waitForEvent("console", async (message) => {
    const [prefix] = message.args();

    return (await prefix?.jsonValue()) === "[Stepik Copilot DOM Prototype]";
  });

  await page.setContent(`
    <!doctype html>
    <html lang="ru">
      <head>
        <title>Formatted Stepik mock</title>
        <style>
          .step-inner__text { display: block; }
        </style>
      </head>
      <body>
        <main>
          <section class="step-inner__text">
            <h2>Настройка BotFather</h2>
            <p>Откройте <strong>официального</strong> бота <code>@BotFather</code>.</p>
            <ul>
              <li>Проверьте галочку рядом с именем.</li>
              <li>Посмотрите количество пользователей.</li>
            </ul>
            <pre><code>/newbot
Token: example</code></pre>
            <p><a href="https://core.telegram.org/bots">Документация Telegram</a></p>
          </section>
        </main>
      </body>
    </html>
  `);
  await page.addScriptTag({ path: DIST_CONTENT_SCRIPT });

  const message = await payloadPromise;
  const [, payloadHandle] = message.args();
  const payload = await payloadHandle.jsonValue() as {
    stepText: string;
    stepMarkdown: string;
    stepContent: {
      markdown: string;
      plainText: string;
    };
  };

  expect(payload.stepText).toContain("Настройка BotFather");
  expect(payload.stepMarkdown).toBe([
    "## Настройка BotFather",
    "",
    "Откройте **официального** бота `@BotFather`.",
    "",
    "- Проверьте галочку рядом с именем.",
    "- Посмотрите количество пользователей.",
    "",
    "```",
    "/newbot",
    "Token: example",
    "```",
    "",
    "[Документация Telegram](https://core.telegram.org/bots)",
  ].join("\n"));
  expect(payload.stepContent.markdown).toBe(payload.stepMarkdown);
  expect(payload.stepContent.plainText).toBe(payload.stepText);
});

test("extracts Stepik comment replies as structured threads", async ({ page }) => {
  const payloadPromise = page.waitForEvent("console", async (message) => {
    const [prefix] = message.args();

    return (await prefix?.jsonValue()) === "[Stepik Copilot DOM Prototype]";
  });

  await page.setContent(`
    <!doctype html>
    <html lang="ru">
      <head>
        <title>Stepik threaded comments mock</title>
        <style>
          body { margin: 0; font-family: sans-serif; }
          .step-inner__text, .discussions__comment-widget, .comments-comment, .comments-comment__viewer { display: block; }
        </style>
      </head>
      <body>
        <main>
          <section class="step-inner__text">Как найти официального BotFather?</section>
          <div class="ember-view discussions__comment-widget">
            <div class="comments-card">
              <div class="comments-comment">
                <span class="user-avatar comments-user-avatar"><img alt="User avatar" /></span>
                <div class="comments-comment__main">
                  <div class="comments-comment__header">
                    <div class="comments-comment__titles">
                      <div class="comments-user-badge">
                        <a class="comments-user-badge__name">Гомзяков Вадим</a>
                      </div>
                      <time class="comments-comment__date" datetime="2026-07-02T19:11:13.000Z">6 дней назад</time>
                    </div>
                  </div>
                  <div class="comments-comment__content">
                    <div class="html-content rich-text-viewer comments-comment__viewer">
                      <span><p>не получается, ввожу в поиске&nbsp;@BotFather&nbsp; и выскакивает множество чужих ботов. как свой сделать?</p></span>
                    </div>
                  </div>
                  <div class="comments-comment__footer">
                    <button type="button">Ответить</button>
                    <button type="button">Скрыть ответы</button>
                  </div>
                  <div class="comments-card__replies" data-has-replies="">
                    <div class="comment-reply__container discussions__comment-widget">
                      <div class="comments-comment">
                        <div class="comments-comment__main">
                          <div class="comments-comment__header">
                            <div class="comments-comment__titles">
                              <div class="comments-user-badge">
                                <a class="comments-user-badge__name">Саид-Магомед Гайрабеков</a>
                              </div>
                              <time class="comments-comment__date" datetime="2026-07-04T12:47:03.000Z">4 дня назад</time>
                            </div>
                          </div>
                          <div class="comments-comment__content">
                            <div class="html-content rich-text-viewer comments-comment__viewer">
                              <span><p>@Гомзяков_Вадим, в телеграме в поиске введите @BotFather, вам высветится официальный бот с галочкой рядом с именем и 9 млн пользователей</p></span>
                            </div>
                          </div>
                          <div class="comments-comment__footer">
                            <button type="button">Ответить</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  `);
  await page.addScriptTag({ path: DIST_CONTENT_SCRIPT });

  const message = await payloadPromise;
  const [, payloadHandle] = message.args();
  const payload = await payloadHandle.jsonValue() as {
    comments: string[];
    commentThreads: Array<{
      root: {
        author?: string;
        relativeTime?: string;
        text: string;
        mentions: string[];
      };
      replies: Array<{
        author?: string;
        relativeTime?: string;
        text: string;
        mentions: string[];
      }>;
    }>;
    context: {
      stats: {
        commentThreadsCount: number;
        repliesCount: number;
      };
    };
  };

  expect(payload.comments).toEqual([
    "не получается, ввожу в поиске @BotFather и выскакивает множество чужих ботов. как свой сделать?",
    "@Гомзяков_Вадим, в телеграме в поиске введите @BotFather, вам высветится официальный бот с галочкой рядом с именем и 9 млн пользователей",
  ]);
  expect(payload.commentThreads).toEqual([
    {
      root: {
        author: "Гомзяков Вадим",
        relativeTime: "6 дней назад",
        text: "не получается, ввожу в поиске @BotFather и выскакивает множество чужих ботов. как свой сделать?",
        mentions: ["@BotFather"],
      },
      replies: [
        {
          author: "Саид-Магомед Гайрабеков",
          relativeTime: "4 дня назад",
          text: "@Гомзяков_Вадим, в телеграме в поиске введите @BotFather, вам высветится официальный бот с галочкой рядом с именем и 9 млн пользователей",
          mentions: ["@Гомзяков_Вадим", "@BotFather"],
        },
      ],
    },
  ]);
  expect(payload.context.stats.commentThreadsCount).toBe(1);
  expect(payload.context.stats.repliesCount).toBe(1);
});

test("opens the sidebar and renders collected comments", async ({ page }) => {
  await page.setContent(`
    <!doctype html>
    <html lang="ru">
      <head>
        <title>Stepik mock</title>
        <style>
          body { margin: 0; min-height: 900px; font-family: sans-serif; }
          .step-inner__text, .comment__text { display: block; }
        </style>
      </head>
      <body>
        <main>
          <h1 class="lesson-title">5.2 Тест: Списки</h1>
          <section class="step-inner__text">Выберите один вариант из списка</section>
          <article class="comments__comment">
            <span class="comment__author">Anonymous 919256933</span>
            <span class="comment__date">6 месяцев назад</span>
            <p class="comment__text">Комментарий для проверки сайдбара.</p>
            <button type="button">Ответить</button>
          </article>
        </main>
      </body>
    </html>
  `);
  await page.addScriptTag({ path: DIST_CONTENT_SCRIPT });

  await page.waitForFunction(() => Boolean(document.querySelector("#stepik-copilot-root")?.shadowRoot));
  await page.evaluate(() => {
    const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;
    const trigger = shadow?.querySelector<HTMLButtonElement>(".sc-trigger");
    trigger?.click();
  });

  await expect.poll(async () => {
    return page.evaluate(() => {
      const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;

      return shadow?.querySelector(".sc-drawer")?.textContent ?? "";
    });
  }).toContain("Данные собраны");

  const sidebarText = await page.evaluate(() => {
    const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;

    return shadow?.querySelector(".sc-drawer")?.textContent ?? "";
  });

  expect(sidebarText).toContain("Stepik Copilot");
  expect(sidebarText).toContain("Данные собраны");
  expect(sidebarText).toContain("Выберите один вариант из списка");
  expect(sidebarText).toContain("Комментарий для проверки сайдбара.");
});

test("renders previous visited steps from the context pack in the sidebar", async ({ page }) => {
  const currentUrl = "https://stepik.org/lesson/200/step/2?unit=302";
  const previousStep = createMockStepPayload({
    lessonId: "200",
    stepPosition: "1",
    unitId: "301",
    stepMarkdown: "## Первый шаг\n\nБазовый материал урока.",
    title: "Первый шаг — Stepik",
  });
  const cache = createStepCache([previousStep]);

  await page.route(currentUrl, async (route) => {
    await route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `
        <!doctype html>
        <html lang="ru">
          <head>
            <title>Второй шаг — Stepik</title>
            <style>
              body { margin: 0; min-height: 900px; font-family: sans-serif; }
              .lesson-title, .step-inner__text { display: block; }
            </style>
          </head>
          <body>
            <main>
              <h1 class="lesson-title">Урок с контекстом</h1>
              <section class="step-inner__text">Материал второго шага.</section>
            </main>
          </body>
        </html>
      `,
    });
  });

  await page.goto(currentUrl);
  await page.evaluate(({ storageKey, storedCache }) => {
    localStorage.setItem(storageKey, JSON.stringify(storedCache));
  }, { storageKey: CONTEXT_STORAGE_KEY, storedCache: cache });
  await page.addScriptTag({ path: DIST_CONTENT_SCRIPT });

  await page.waitForFunction(() => Boolean(document.querySelector("#stepik-copilot-root")?.shadowRoot));
  await page.evaluate(() => {
    const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>(".sc-trigger")?.click();
  });

  await expect.poll(async () => {
    return page.evaluate(() => {
      const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;

      return shadow?.querySelector(".sc-drawer")?.textContent ?? "";
    });
  }).toContain("Предыдущие посещенные шаги");

  const sidebarText = await page.evaluate(() => {
    const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;

    return shadow?.querySelector(".sc-drawer")?.textContent ?? "";
  });

  expect(sidebarText).toContain("посещенные страницы");
  expect(sidebarText).toContain("Шаг 1");
  expect(sidebarText).toContain("Первый шаг");
});

test("renders the learning request preview and switches modes in the sidebar", async ({ page }) => {
  await page.setContent(`
    <!doctype html>
    <html lang="ru">
      <head>
        <title>Stepik learning request mock</title>
        <style>
          body { margin: 0; min-height: 900px; font-family: sans-serif; }
          .step-inner__text, .comment__text { display: block; }
        </style>
      </head>
      <body>
        <main>
          <h1 class="lesson-title">Тестовый урок</h1>
          <section class="step-inner__text">
            <h2>Обход списка</h2>
            <p>Разберите, сколько раз выполнится тело цикла.</p>
          </section>
          <article class="comments__comment">
            <p class="comment__text">Комментарий про частую ошибку.</p>
          </article>
        </main>
      </body>
    </html>
  `);
  await page.addScriptTag({ path: DIST_CONTENT_SCRIPT });

  await page.waitForFunction(() => Boolean(document.querySelector("#stepik-copilot-root")?.shadowRoot));
  await page.evaluate(() => {
    const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>(".sc-trigger")?.click();
  });

  await expect.poll(async () => {
    return page.evaluate(() => {
      const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;

      return shadow?.querySelector(".sc-learning")?.textContent ?? "";
    });
  }).toContain("Учебный запрос");

  const initialLearningState = await page.evaluate(() => {
    const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;

    return {
      activeMode: shadow?.querySelector(".sc-mode-button.is-active")?.textContent,
      preview: shadow?.querySelector(".sc-request-preview")?.textContent,
      copyButton: shadow?.querySelector(".sc-copy-request")?.textContent,
    };
  });

  expect(initialLearningState.activeMode).toBe("Подсказка");
  expect(initialLearningState.preview).toContain('"mode": "hint"');
  expect(initialLearningState.preview).toContain("Комментарий про частую ошибку.");
  expect(initialLearningState.preview).toContain('"noDirectAnswers": true');
  expect(initialLearningState.copyButton).toContain("Скопировать запрос");

  await page.evaluate(() => {
    const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;
    const notesButton = Array.from(shadow?.querySelectorAll<HTMLButtonElement>(".sc-mode-button") ?? [])
      .find((button) => button.textContent === "Конспект");
    notesButton?.click();
  });

  await expect.poll(async () => {
    return page.evaluate(() => {
      const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;

      return shadow?.querySelector(".sc-request-preview")?.textContent ?? "";
    });
  }).toContain('"mode": "notes"');
});

test("renders backend Copilot answer and resets it when mode changes", async ({ page }) => {
  let capturedRequest: LearningRequest | undefined;

  await page.route(BACKEND_ANALYZE_URL, async (route) => {
    capturedRequest = route.request().postDataJSON() as LearningRequest;
    await new Promise((resolve) => setTimeout(resolve, 120));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: "learning-analysis-v1",
        mode: capturedRequest.mode,
        source: "backend-mock",
        summary: "Backend mock-подсказка проверяет связку extension и FastAPI.",
        focusPoints: ["На что обратить внимание"],
        commentInsights: ["Что путает других"],
        selfCheck: ["Проверь себя"],
        needsMoreContext: "Контекст достаточен для mock-проверки.",
        warnings: ["Учебный режим: backend mock не выбирает вариант ответа и не раскрывает правильный выбор."],
      } satisfies LearningAnalysis),
    });
  });

  await page.setContent(`
    <!doctype html>
    <html lang="ru">
      <head>
        <title>Stepik mock analysis sidebar</title>
        <style>
          body { margin: 0; min-height: 900px; font-family: sans-serif; }
          .step-inner__text, .comment__text { display: block; }
        </style>
      </head>
      <body>
        <main>
          <h1 class="lesson-title">Тестовый урок</h1>
          <section class="step-inner__text">Выберите один вариант из списка</section>
          <label><input type="radio" name="answer" /> первый вариант</label>
          <label><input type="radio" name="answer" /> второй вариант</label>
          <article class="comments__comment">
            <p class="comment__text">Комментарий про частую ошибку.</p>
          </article>
        </main>
      </body>
    </html>
  `);
  await page.addScriptTag({ path: DIST_CONTENT_SCRIPT });

  await page.waitForFunction(() => Boolean(document.querySelector("#stepik-copilot-root")?.shadowRoot));
  await page.evaluate(() => {
    const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>(".sc-trigger")?.click();
  });

  await expect.poll(async () => {
    return page.evaluate(() => {
      const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;

      return shadow?.querySelector(".sc-analysis")?.textContent ?? "";
    });
  }).toContain("Сформировать preview ответа");

  await page.evaluate(() => {
    const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>(".sc-generate-analysis")?.click();
  });

  await expect.poll(async () => {
    return page.evaluate(() => {
      const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;

      return shadow?.querySelector(".sc-analysis")?.textContent ?? "";
    });
  }).toContain("Отправляю в backend");

  await expect.poll(async () => {
    return page.evaluate(() => {
      const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;

      return shadow?.querySelector(".sc-analysis")?.textContent ?? "";
    });
  }).toContain("О чем шаг");

  expect(capturedRequest?.version).toBe("learning-request-v1");
  expect(capturedRequest?.mode).toBe("hint");
  expect(capturedRequest?.input.currentStep.markdown).toContain("Выберите один вариант из списка");
  expect(capturedRequest?.input.comments).toEqual(["Комментарий про частую ошибку."]);

  const generatedText = await page.evaluate(() => {
    const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;

    return shadow?.querySelector(".sc-analysis")?.textContent ?? "";
  });

  expect(generatedText).toContain("На что обратить внимание");
  expect(generatedText).toContain("Что путает других");
  expect(generatedText).toContain("Проверь себя");
  expect(generatedText).toContain("не выбирает вариант ответа");
  expect(generatedText).toContain("backend-mock");

  await page.evaluate(() => {
    const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;
    const explainButton = Array.from(shadow?.querySelectorAll<HTMLButtonElement>(".sc-mode-button") ?? [])
      .find((button) => button.textContent === "Объяснить");
    explainButton?.click();
  });

  await expect.poll(async () => {
    return page.evaluate(() => {
      const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;

      return shadow?.querySelector(".sc-analysis")?.textContent ?? "";
    });
  }).toContain("Backend пока не вызван");
});

test("renders backend analysis error without breaking the sidebar", async ({ page }) => {
  await page.route(BACKEND_ANALYZE_URL, async (route) => {
    await route.fulfill({
      status: 413,
      contentType: "application/json",
      headers: {
        "X-Request-Id": "req-playwright-413",
      },
      body: JSON.stringify({
        error: {
          code: "payload_too_large",
          message: "currentStep.markdown is too large",
          requestId: "req-playwright-413",
        },
      }),
    });
  });

  await page.setContent(`
    <!doctype html>
    <html lang="ru">
      <head>
        <title>Stepik backend error mock</title>
        <style>
          body { margin: 0; min-height: 900px; font-family: sans-serif; }
          .step-inner__text { display: block; }
        </style>
      </head>
      <body>
        <main>
          <h1 class="lesson-title">Тестовый урок</h1>
          <section class="step-inner__text">Материал шага для backend error.</section>
        </main>
      </body>
    </html>
  `);
  await page.addScriptTag({ path: DIST_CONTENT_SCRIPT });

  await page.waitForFunction(() => Boolean(document.querySelector("#stepik-copilot-root")?.shadowRoot));
  await page.evaluate(() => {
    const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>(".sc-trigger")?.click();
  });

  await expect.poll(async () => {
    return page.evaluate(() => {
      const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;

      return shadow?.querySelector(".sc-analysis")?.textContent ?? "";
    });
  }).toContain("Сформировать preview ответа");

  await page.evaluate(() => {
    const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>(".sc-generate-analysis")?.click();
  });

  await expect.poll(async () => {
    return page.evaluate(() => {
      const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;

      return shadow?.querySelector(".sc-analysis")?.textContent ?? "";
    });
  }).toContain("Backend не ответил");

  const sidebarText = await page.evaluate(() => {
    const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;

    return shadow?.querySelector(".sc-drawer")?.textContent ?? "";
  });

  expect(sidebarText).toContain("currentStep.markdown is too large");
  expect(sidebarText).toContain("req-playwright-413");
  expect(sidebarText).toContain("Материал шага для backend error.");
});

test("renders markdown formatting in the sidebar", async ({ page }) => {
  await page.setContent(`
    <!doctype html>
    <html lang="ru">
      <head>
        <title>Stepik markdown sidebar mock</title>
        <style>
          body { margin: 0; min-height: 900px; font-family: sans-serif; }
          .step-inner__text { display: block; }
        </style>
      </head>
      <body>
        <main>
          <section class="step-inner__text">
            <h2>Настройка BotFather</h2>
            <p>Откройте <strong>официального</strong> бота <code>@BotFather</code>.</p>
            <ul>
              <li>Проверьте галочку.</li>
            </ul>
          </section>
        </main>
      </body>
    </html>
  `);
  await page.addScriptTag({ path: DIST_CONTENT_SCRIPT });

  await page.waitForFunction(() => Boolean(document.querySelector("#stepik-copilot-root")?.shadowRoot));
  await page.evaluate(() => {
    const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;
    shadow?.querySelector<HTMLButtonElement>(".sc-trigger")?.click();
  });

  await expect.poll(async () => {
    return page.evaluate(() => {
      const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;

      return shadow?.querySelector(".sc-drawer")?.textContent ?? "";
    });
  }).toContain("Данные собраны");

  const rendered = await page.evaluate(() => {
    const shadow = document.querySelector("#stepik-copilot-root")?.shadowRoot;

    return {
      heading: shadow?.querySelector(".sc-md-heading")?.textContent,
      inlineCode: shadow?.querySelector(".sc-md-inline-code")?.textContent,
      listItem: shadow?.querySelector(".sc-md-list li")?.textContent,
      copyButton: shadow?.querySelector(".sc-copy")?.textContent,
    };
  });

  expect(rendered).toEqual({
    heading: "Настройка BotFather",
    inlineCode: "@BotFather",
    listItem: "Проверьте галочку.",
    copyButton: "Скопировать MD",
  });
});
