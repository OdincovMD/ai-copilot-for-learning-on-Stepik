# Stepik Copilot Extension

Минимальный прототип Chrome Extension MV3 + FastAPI backend bridge для проверки,
что со страницы Stepik можно собрать payload текущего шага и отправить его в
локальный backend. Backend умеет работать в mock-режиме, с локальной Ollama или
с внешним provider через серверный env.

## Установка зависимостей

```bash
npm install
cp .env.example .env
```

## Сборка

```bash
set -a
. ./.env
set +a
npm run build
```

После сборки расширение будет лежать в `dist/`.

## Проверка

```bash
set -a
. ./.env
set +a
npm test
```

Тесты собирают расширение, запускают Playwright на mock-странице Stepik и
проверяют:

- извлечение текста шага;
- извлечение комментариев без автора, даты и кнопок;
- сбор Context Pack из ранее посещенных шагов урока;
- открытие сайдбара и отображение собранных данных.

Backend-тесты запускаются отдельно:

```bash
cd backend
python3 -m pip install -r requirements.txt
set -a
. ../.env
set +a
python3 -m pytest
```

## Локальный backend

Расширение отправляет `LearningRequest` в локальный FastAPI-сервис. Все порты,
адреса, модели и ключи берутся из `.env`; не хардкодь их в compose, Dockerfile
или коде приложения.

Также backend читает из `.env` лимиты входного payload:

- `MAX_CURRENT_STEP_MARKDOWN_CHARS`
- `MAX_PREVIOUS_STEPS`
- `MAX_PREVIOUS_STEP_MARKDOWN_CHARS`
- `MAX_COMMENTS`
- `MAX_COMMENT_CHARS`
- `MAX_TOTAL_REQUEST_CHARS`

Если расширение или поддельный клиент отправит слишком большой запрос,
`POST /analyze-step` вернет `413` с единым error contract. Каждый backend-ответ
получает header `X-Request-Id`; extension показывает `requestId` в ошибке,
если backend его прислал.

```ts
type ApiError = {
  error: {
    code:
      | "payload_too_large"
      | "validation_error"
      | "provider_config_error"
      | "provider_error"
      | "internal_error";
    message: string;
    requestId: string;
    details?: unknown;
  };
};
```

`ANALYSIS_PROVIDER=mock` оставляет текущий deterministic backend mock.
`ANALYSIS_PROVIDER=ollama` переключает `/analyze-step` на локальную Ollama. Для
этого нужны `OLLAMA_BASE_URL`, `OLLAMA_MODEL` и `OLLAMA_TIMEOUT_SECONDS` в
`.env`; API-ключ не нужен.
`ANALYSIS_PROVIDER=openai` переключает `/analyze-step` на OpenAI Responses API;
для этого нужны `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` и
`OPENAI_TIMEOUT_SECONDS` в `.env`. Ключи никогда не попадают в extension.

### Локальная Ollama

Это бесплатный dev-путь без платных токенов. По умолчанию в `.env.example`
стоит легкая модель `qwen2.5:3b`; если качество будет слабым, можно заменить
только `OLLAMA_MODEL`.

#### Ollama в Docker

Этот вариант не требует устанавливать Ollama на хост. Сервис `ollama` и
одноразовый `ollama-pull` включены в compose-профиль `ollama`; модель
скачивается в Docker volume `ollama-models`.

В `.env`:

```env
ANALYSIS_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=qwen2.5:3b
```

Запуск:

```bash
docker compose --env-file .env --profile ollama up --build backend ollama-pull
```

`ollama-pull` завершится после скачивания модели, а `backend` и `ollama`
останутся работать. Если модель уже лежит в volume, команда быстро проверит ее
наличие и не будет заново тянуть весь вес.

#### Ollama на хосте

Если Ollama уже установлена на машине, можно не поднимать контейнер `ollama`.
Для backend в Docker поставь:

```env
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

Для backend без Docker поставь:

```env
OLLAMA_BASE_URL=http://localhost:11434
```

```bash
ollama pull qwen2.5:3b
ollama serve
```

Локальная модель может долго отвечать на первом запросе. Extension ждет ответ
столько, сколько указано в `VITE_ANALYSIS_TIMEOUT_MS`; после изменения этого
значения нужно заново выполнить `npm run build` и reload temporary add-on.

### Через Docker Compose

```bash
cp .env.example .env
docker compose --env-file .env up --build backend
```

Health-check в другом терминале:

```bash
set -a
. ./.env
set +a
curl "${VITE_BACKEND_URL}/health"
```

### Без Docker

```bash
cd backend
python3 -m pip install -r requirements.txt
set -a
. ../.env
set +a
python3 -m uvicorn app.main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT" --reload
```

Health-check:

```bash
set -a
. ./.env
set +a
curl "${VITE_BACKEND_URL}/health"
```

Ожидаемый ответ:

```json
{
  "status": "ok",
  "service": "stepik-copilot-api"
}
```

## Локальная загрузка в Chrome

1. Открой `chrome://extensions`.
2. Включи `Developer mode`.
3. Нажми `Load unpacked`.
4. Выбери папку `dist`.
5. Открой страницу Stepik: `https://stepik.org/...`.
6. Нажми плавающую кнопку Stepik Copilot справа на странице.
7. Проверь, что открылся сайдбар с контекстом, текстом шага и комментариями.
8. Запусти backend и нажми `Сформировать preview ответа`.
9. Для отладки можно открыть DevTools страницы и найти логи
   `[Stepik Copilot DOM Prototype]`, `[Stepik Copilot Context Pack]` и
   `[Stepik Copilot Learning Analysis]`.

## Локальная загрузка в Firefox

1. Выполни `npm run build`.
2. Открой `about:debugging#/runtime/this-firefox`.
3. Нажми `Load Temporary Add-on`.
4. Выбери файл `dist/manifest.json`.
5. Открой несколько шагов одного урока Stepik подряд.
6. Нажми плавающую кнопку Stepik Copilot справа.
7. В блоке `Контекст` проверь, что появились предыдущие посещенные шаги.
8. Запусти backend и нажми `Сформировать preview ответа`.
9. В DevTools страницы можно найти логи:
   `[Stepik Copilot DOM Prototype]`, `[Stepik Copilot Context Pack]` и
   `[Stepik Copilot Learning Analysis]`.

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

## Mock Copilot Answer

Блок `Ответ Copilot` отправляет `LearningRequest` в FastAPI backend по адресу
из `VITE_BACKEND_URL`. Provider выбирается через `ANALYSIS_PROVIDER`: mock для
детерминированного теста, ollama для бесплатной локальной модели, openai для
серверного внешнего provider.

```ts
type LearningAnalysis = {
  version: "learning-analysis-v1";
  mode: "explain" | "hint" | "notes";
  source: "backend-mock" | "ollama" | "openai";
  summary: string;
  focusPoints: string[];
  commentInsights: string[];
  selfCheck: string[];
  needsMoreContext: string;
  warnings: string[];
};
```

Backend mock сохраняет anti-cheating поведение: для тестов не выбирает вариант,
для задач с кодом не пишет финальное решение целиком. Если backend не запущен,
сайдбар покажет ошибку в блоке `Ответ Copilot`, но собранный payload останется
видимым.

## Текущий UI

- Плавающая кнопка справа открывает и закрывает сайдбар.
- Кнопка `Обновить данные` повторно собирает payload из видимого DOM.
- Блок `Учебный запрос` показывает AI-ready preview и позволяет скопировать
  запрос для ручной проверки.
- Блок `Ответ Copilot` отправляет запрос в локальный FastAPI backend и
  показывает structured mock без AI-вызова.
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
