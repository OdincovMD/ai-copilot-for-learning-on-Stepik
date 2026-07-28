from __future__ import annotations

from .models import LearningAnalysis, LearningRequest, StepKind


def build_mock_learning_analysis(request: LearningRequest) -> LearningAnalysis:
    return LearningAnalysis(
        version="learning-analysis-v1",
        mode=request.mode,
        source="backend-mock",
        summary=build_summary(request),
        focusPoints=build_focus_points(request),
        commentInsights=build_comment_insights(request),
        selfCheck=build_self_check(request),
        needsMoreContext=build_needs_more_context(request),
        warnings=build_warnings(request.input.currentStep.task.kind),
    )


def build_summary(request: LearningRequest) -> str:
    current_step = request.input.currentStep
    title = current_step.title or current_step.metadata.stepTitle or "текущий шаг"
    context_phrase = (
        f"учитывая {format_previous_steps(len(request.input.previousSteps))}"
        if request.input.previousSteps
        else "только по текущему видимому шагу"
    )

    if request.mode == "explain":
        return (
            f"Объяснение для «{title}» строится {context_phrase}: mock показывает, какие идеи проверяет шаг, "
            "почему они важны и где легко ошибиться, не переходя к конкретному ответу."
        )

    if request.mode == "hint":
        return (
            f"Подсказка для «{title}» строится {context_phrase}: mock дает направление размышления "
            "и следующий безопасный шаг без готового решения."
        )

    return (
        f"Конспект для «{title}» собирает {context_phrase}: mock фиксирует термины, правила и предупреждения "
        "в компактном формате для повторения."
    )


def build_focus_points(request: LearningRequest) -> list[str]:
    base_points = [
        "Сначала выделить формулировку задания и ограничения, а уже потом смотреть на варианты или поле ответа.",
        "Сравнить текущий шаг с предыдущим контекстом, если он есть, чтобы не терять связку урока.",
    ]

    if request.mode == "notes":
        return [
            "Термины: выписать только понятия и обозначения, которые реально видны в шаге.",
            "Правила: сохранить условия применения и ограничения отдельными короткими пунктами.",
            "Ошибки: отделить факты из шага от комментариев и догадок.",
            base_points[1],
        ]

    if request.mode == "explain":
        return [
            "Показать, какую идею проверяет шаг и зачем она нужна в теме урока.",
            "Разобрать причину типичной ошибки, не сопоставляя ее с конкретным вариантом ответа.",
            "Связать формулировку задания с предыдущим контекстом, если он есть.",
        ]

    return [
        "Что именно спрашивает формулировка, если закрыть варианты ответа?",
        "Какие ограничения нужно проверить перед первым действием?",
        "Какой один следующий шаг продвинет рассуждение без спойлера?",
        base_points[1],
    ]


def build_comment_insights(request: LearningRequest) -> list[str]:
    if not request.input.comments:
        if request.mode == "notes":
            return ["Комментариев нет: в конспекте сохраняем только факты из шага и посещенный контекст."]

        if request.mode == "explain":
            return ["Комментариев нет: объяснение опирается на формулировку шага и не добавляет чужие ошибки."]

        return ["Комментариев нет: подсказка строится без ловушек из обсуждения."]

    comments_count = len(request.input.comments)
    threads_note = (
        f"Есть треды обсуждений: {request.input.commentThreadsCount}; учитывать только устойчивые сигналы."
        if request.input.commentThreadsCount > 0
        else "Треды ответов не обнаружены или не раскрыты в DOM."
    )

    if request.mode == "notes":
        return [
            f"Комментарии: {comments_count}; сохранить только повторяющиеся предупреждения и частые ошибки.",
            threads_note,
        ]

    if request.mode == "explain":
        return [
            f"Комментарии: {comments_count}; использовать их как признаки мест, где стоит объяснить причину ошибки.",
            threads_note,
        ]

    return [
        f"Комментарии: {comments_count}; превратить замеченные ловушки в вопросы самопроверки без спойлера.",
        threads_note,
    ]


def build_self_check(request: LearningRequest) -> list[str]:
    kind = request.input.currentStep.task.kind
    if request.mode == "notes":
        checks = [
            "Какие 2-3 термина из шага нужно повторить перед продолжением?",
            "Какие ограничения или условия применения стоит сохранить в конспекте?",
            "Что из комментариев является предупреждением, а что только частным мнением?",
        ]
    elif request.mode == "explain":
        checks = [
            "Могу ли я своими словами объяснить, какую идею проверяет шаг?",
            "Понимаю ли я причину ограничения в формулировке, а не только знакомые слова?",
            "Могу ли я объяснить типичную ошибку без выбора конкретного ответа?",
        ]
    else:
        checks = [
            "Что именно спрашивает шаг, если не смотреть на поле ответа?",
            "Какое ограничение формулировки нужно проверить первым?",
            "Не опираюсь ли я на feedback платформы вместо собственного рассуждения?",
        ]

    if kind == "choice":
        return [
            "Могу ли я обосновать свое рассуждение без номера, буквы или текста варианта?",
            *checks,
        ]

    if kind == "code":
        return [
            "Понимаю ли я общий алгоритм до написания кода?",
            "Есть ли у меня минимальные тестовые случаи для проверки решения?",
            *checks,
        ]

    return checks


def build_needs_more_context(request: LearningRequest) -> str:
    if not request.input.previousSteps:
        if request.mode == "notes":
            return "Контекст ограничен текущим шагом: в конспект стоит добавить предыдущие определения урока."

        if request.mode == "explain":
            return "Контекст ограничен текущим шагом: объяснение станет точнее, если открыть предыдущие шаги урока."

        return "Контекст ограничен текущим шагом: подсказка остается общей, чтобы не додумывать недостающие условия."

    if request.mode == "notes":
        return "Для mock-конспекта достаточно текущего шага и посещенного контекста; реальная модель выделит связи точнее."

    if request.mode == "explain":
        return "Для mock-объяснения достаточно текущего шага и посещенного контекста; реальная модель оценит пробелы точнее."

    return "Для mock-подсказки достаточно текущего шага и посещенного контекста; реальная модель точнее выберет безопасный уровень подсказки."


def build_warnings(kind: StepKind) -> list[str]:
    if kind == "choice":
        return ["Учебный режим: backend mock не выбирает вариант ответа и не раскрывает правильный выбор."]

    if kind == "code":
        return ["Учебный режим: backend mock не пишет финальное решение целиком и не заменяет самостоятельную работу."]

    return ["Backend mock локальный: он проверяет API-форму результата, а не качество AI-анализа."]


def format_previous_steps(count: int) -> str:
    return f"{count} {pluralize_ru(count, 'предыдущий посещенный шаг', 'предыдущих посещенных шага', 'предыдущих посещенных шагов')}"


def pluralize_ru(count: int, one: str, few: str, many: str) -> str:
    absolute_count = abs(count)
    last_two_digits = absolute_count % 100
    last_digit = absolute_count % 10

    if 11 <= last_two_digits <= 14:
        return many

    if last_digit == 1:
        return one

    if 2 <= last_digit <= 4:
        return few

    return many
