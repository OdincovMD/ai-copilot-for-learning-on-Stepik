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

## Локальная загрузка в Chrome

1. Открой `chrome://extensions`.
2. Включи `Developer mode`.
3. Нажми `Load unpacked`.
4. Выбери папку `dist`.
5. Открой страницу Stepik: `https://stepik.org/...`.
6. Открой DevTools страницы и найди лог `[Stepik Copilot DOM Prototype]`.

## Текущий payload

```ts
type StepPayload = {
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
```

На страницах без видимых комментариев `comments` должен быть пустым массивом.
