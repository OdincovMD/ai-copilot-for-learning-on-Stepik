# Stepik Copilot Extension

Минимальный DOM-only прототип Chrome Extension MV3 для проверки, что со
страницы Stepik можно собрать payload текущего шага без backend, AI и Stepik
API.

## Установка зависимостей

```bash
npm install
```

## Сборка

```bash
npm run build
```

После сборки расширение будет лежать в `dist/`.

## Проверка

```bash
npm test
```

Тесты собирают расширение, запускают Playwright на mock-странице Stepik и
проверяют:

- извлечение текста шага;
- извлечение комментариев без автора, даты и кнопок;
- сбор Context Pack из ранее посещенных шагов урока;
- открытие сайдбара и отображение собранных данных.

## Локальная загрузка в Chrome

1. Открой `chrome://extensions`.
2. Включи `Developer mode`.
3. Нажми `Load unpacked`.
4. Выбери папку `dist`.
5. Открой страницу Stepik: `https://stepik.org/...`.
6. Нажми плавающую кнопку Stepik Copilot справа на странице.
7. Проверь, что открылся сайдбар с контекстом, текстом шага и комментариями.
8. Для отладки можно открыть DevTools страницы и найти лог
   `[Stepik Copilot DOM Prototype]`.

## Локальная загрузка в Firefox

1. Выполни `npm run build`.
2. Открой `about:debugging#/runtime/this-firefox`.
3. Нажми `Load Temporary Add-on`.
4. Выбери файл `dist/manifest.json`.
5. Открой несколько шагов одного урока Stepik подряд.
6. Нажми плавающую кнопку Stepik Copilot справа.
7. В блоке `Контекст` проверь, что появились предыдущие посещенные шаги.
8. В DevTools страницы можно найти два лога:
   `[Stepik Copilot DOM Prototype]` и `[Stepik Copilot Context Pack]`.

## Текущий payload

```ts
type StepPayload = {
  url: string;
  title?: string;
  stepText: string;
  stepMarkdown: string;
  stepContent: {
    format: "markdown";
    markdown: string;
    plainText: string;
  };
  comments: string[];
  commentThreads: Array<{
    root: {
      text: string;
      author?: string;
      relativeTime?: string;
      mentions: string[];
    };
    replies: Array<{
      text: string;
      author?: string;
      relativeTime?: string;
      mentions: string[];
    }>;
  }>;
  metadata: {
    courseTitle?: string;
    lessonTitle?: string;
    stepTitle?: string;
  };
  context: {
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
      kind: "choice" | "code" | "text" | "video" | "unknown";
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
};
```

`stepText` остается plain-text полем для быстрых проверок и совместимости.
`stepMarkdown` и `stepContent.markdown` сохраняют форматирование учебного
текста в Markdown: заголовки, абзацы, списки, ссылки, inline code, code blocks,
цитаты и простые таблицы. Это будущая база для экспорта конспекта в `.md`.

На страницах без видимых комментариев `comments` должен быть пустым массивом.
Поле `comments` остается плоским списком для совместимости, а `commentThreads`
сохраняет структуру переписок: корневой комментарий и ответы на него.

Контекст намеренно не содержит тексты вариантов ответа отдельным полем: для
тестовых шагов мы фиксируем тип задания и количество вариантов, но не готовим
payload как источник прямого ответа.

## Context Pack

Расширение запоминает только те шаги, которые пользователь уже открыл сам.
Для текущего шага собирается локальный пакет контекста из предыдущих посещенных
шагов того же урока:

```ts
type ContextPack = {
  currentStep: StepPayload;
  previousSteps: Array<{
    url: string;
    title?: string;
    stepText: string;
    stepMarkdown: string;
    metadata: StepPayload["metadata"];
    context: Pick<StepPayload["context"], "ids" | "task">;
    cachedAt: string;
  }>;
  source: "visited-cache";
  limits: {
    maxPreviousSteps: number;
    maxCharacters: number;
  };
  stats: {
    totalVisitedInLesson: number;
    includedPreviousSteps: number;
    truncated: boolean;
  };
};
```

`previousSteps` не содержит `comments` и `commentThreads`: комментарии остаются
только у текущего шага, чтобы будущий AI-контекст не раздувался шумными
переписками. Если открыть сразу середину урока, предыдущих шагов не будет —
они появятся после посещения ранних шагов.

## Learning Request Preview

Сайдбар локально формирует preview будущего AI-запроса. Данные никуда не
отправляются: backend, API-ключи и реальные LLM-вызовы пока не подключены.

Доступны режимы:

- `Объяснить` — разобрать текущий шаг и ключевые идеи;
- `Подсказка` — дать guidance без готового ответа;
- `Конспект` — подготовить Markdown-конспект по текущему и предыдущим шагам.

Preview содержит текущий Markdown, предыдущие посещенные шаги, комментарии
текущего шага и guardrails:

```ts
type LearningRequest = {
  version: "learning-request-v1";
  mode: "explain" | "hint" | "notes";
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
};
```

Для тестовых и кодовых шагов инструкция явно запрещает выбирать вариант ответа,
раскрывать прямой ответ или писать финальное решение целиком.

## Текущий UI

- Плавающая кнопка справа открывает и закрывает сайдбар.
- Кнопка `Обновить данные` повторно собирает payload из видимого DOM.
- Блок `Учебный запрос` показывает AI-ready preview и позволяет скопировать
  запрос для ручной проверки.
- Блок `Контекст` показывает источник `посещенные страницы` и компактный
  список предыдущих посещенных шагов текущего урока.
- Блок `Текст шага` отображает Markdown-preview с заголовками, списками,
  ссылками и code blocks.
- Кнопка `Скопировать MD` копирует Markdown текущего шага в буфер обмена.
- Сайдбар показывает состояния сбора, ошибки и пустого текста шага.
- UI изолирован через Shadow DOM, чтобы стили Stepik и расширения не
  конфликтовали.

## Если комментарии снова парсятся с шумом

Открой DevTools на странице Stepik и выполни:

```js
Array.from(document.querySelectorAll("[data-qa*='comment'], [class*='comment']"))
  .slice(0, 5)
  .map((element) => ({
    className: element.className,
    text: element.textContent?.replace(/\s+/g, " ").trim(),
    html: element.outerHTML.slice(0, 2000),
  }));
```

Самое полезное для доработки — `html` одного реального блока комментария,
который попал в payload неправильно.
