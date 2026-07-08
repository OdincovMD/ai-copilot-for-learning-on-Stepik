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

## Текущий payload

```ts
type StepPayload = {
  url: string;
  title?: string;
  stepText: string;
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

На страницах без видимых комментариев `comments` должен быть пустым массивом.
Поле `comments` остается плоским списком для совместимости, а `commentThreads`
сохраняет структуру переписок: корневой комментарий и ответы на него.

Контекст намеренно не содержит тексты вариантов ответа отдельным полем: для
тестовых шагов мы фиксируем тип задания и количество вариантов, но не готовим
payload как источник прямого ответа.

## Текущий UI

- Плавающая кнопка справа открывает и закрывает сайдбар.
- Кнопка `Обновить данные` повторно собирает payload из видимого DOM.
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
