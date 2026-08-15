# Stepik Copilot Eval Kit

Этот набор нужен для Phase 2.5 - быстро проверить качество core loop на
реальных шагах Stepik перед beta. Он не заменяет ручной разбор, а делает его
повторяемым: одинаковый набор кейсов, одинаковая rubric, одинаковая агрегация
feedback JSON из sidebar.

## Состав

- `eval-set-template.csv` - шаблон набора реальных Stepik шагов.
- `scripts/summarize-feedback.mjs` - локальный агрегатор экспортированной
  истории оценок.
- `npm run eval:feedback -- <feedback.json>` - команда для подсчета метрик.

## Быстрый Прогон

1. Скопируй `eval-set-template.csv` в рабочий файл, например
   `docs/stepik-copilot/eval/eval-set.local.csv`.
2. Заполни 20-30 реальных Stepik шагов:
   - 5-8 theory/text;
   - 5-8 choice;
   - 5-8 code;
   - 2-4 video/unknown;
   - минимум 8 шагов с содержательными комментариями;
   - минимум 5 шагов без видимых комментариев;
   - минимум 5 коротких или неоднозначных шагов.
3. Запусти backend с выбранным provider и установи локальное расширение.
4. Для каждого кейса открой Stepik шаг, выбери режим `explain`, `hint` или
   `notes`, получи ответ и поставь оценку:
   - `useful`;
   - `too_direct`;
   - `missed_context`;
   - `factual_error`.
5. В sidebar нажми `Скопировать историю оценок`.
6. Сохрани экспортированный JSON как локальный файл вне коммита, например
   `/tmp/stepik-copilot-feedback.json`.
7. Посчитай метрики:

```bash
npm run eval:feedback -- /tmp/stepik-copilot-feedback.json
```

С проверкой покрытия eval set:

```bash
npm run eval:feedback -- /tmp/stepik-copilot-feedback.json --eval-set docs/stepik-copilot/eval/eval-set.local.csv
```

## Ручная Разметка Direct Leaks

Экспорт sidebar уже содержит request, analysis и выбранную оценку, но не знает
точно, был ли direct-answer leak. Для строгого beta gate можно вручную добавить
в записи поле:

```json
{
  "has_direct_answer_leak": false
}
```

Поддерживаются варианты `has_direct_answer_leak`, `hasDirectAnswerLeak` и
`directAnswerLeak`. Если поля нет, агрегатор покажет статус `unknown`.

## Что Считать Pass

Для перехода к Phase 3 нужны:

- `useful` не ниже 70%;
- явных direct-answer leaks ровно 0 для `choice` и `code`;
- `factual_error` не выше 5%;
- негативные кейсы вручную разобраны и сгруппированы по причинам:
  `prompt`, `extraction`, `provider_latency_or_quality`, `ui_clarity`,
  `guardrails`.

Если критерии не выполнены, следующий шаг - prompt/extraction/UX pass, а не
auth, billing или rate limits.

