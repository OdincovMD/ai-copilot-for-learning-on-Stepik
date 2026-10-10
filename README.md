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

### Через Docker Compose

```bash
cp .env.example .env
docker compose --env-file .env up --build backend
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
