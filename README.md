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



`ANALYSIS_PROVIDER=mock` оставляет текущий deterministic backend mock.
`ANALYSIS_PROVIDER=ollama` переключает `/analyze-step` на локальную Ollama. Для
этого нужны `OLLAMA_BASE_URL`, `OLLAMA_MODEL` и `OLLAMA_TIMEOUT_SECONDS` в
`.env`; API-ключ не нужен.
`ANALYSIS_PROVIDER=openai` переключает `/analyze-step` на OpenAI Responses API;
для этого нужны `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` и
`OPENAI_TIMEOUT_SECONDS` в `.env`. Ключи никогда не попадают в extension.
`ANALYSIS_PROVIDER=groq` переключает `/analyze-step` на Groq chat completions
через OpenAI-compatible API; для этого нужны `GROQ_API_KEY`, `GROQ_MODEL`,
`GROQ_BASE_URL` и `GROQ_TIMEOUT_SECONDS` в `.env`.

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




