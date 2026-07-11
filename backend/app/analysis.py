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
            f"Backend mock объясняет «{title}» {context_phrase}. "
            "В будущем AI-ответе здесь будет короткое объяснение смысла шага без готового решения."
        )

    if request.mode == "hint":
        return (
            f"Backend mock-подсказка для «{title}» строится {context_phrase}. "
            "Формат проверяет guidance: вопросы, ограничения и самопроверку вместо прямого ответа."
        )

    return (
        f"Backend mock-конспект для «{title}» собирает структуру текущего материала и доступный контекст. "
        "Реальный ответ позже превратит это в компактные Markdown-заметки."
    )


def build_focus_points(request: LearningRequest) -> list[str]:
    base_points = [
        "Сначала выделить формулировку задания и ограничения, а уже потом смотреть на варианты или поле ответа.",
        "Сравнить текущий шаг с предыдущим контекстом, если он есть, чтобы не терять связку урока.",
    ]

    if request.mode == "notes":
        return [
            "Сохранить определения и ключевые условия в виде коротких Markdown-пунктов.",
            "Отделить факты из шага от комментариев и догадок.",
            base_points[1],
        ]

    if request.mode == "explain":
        return [
            "Объяснить, какие понятия проверяет шаг, не переходя к готовому ответу.",
            *base_points,
        ]

    return [
        "Сформулировать 2-3 проверочных вопроса, которые подведут к решению без спойлера.",
        *base_points,
    ]


def build_comment_insights(request: LearningRequest) -> list[str]:
    if not request.input.comments:
        return ["Видимых комментариев нет, поэтому backend mock не делает выводов по обсуждению."]

    return [
        (
            f"Видимых комментариев: {len(request.input.comments)}. "
            "В реальном анализе здесь будут только устойчивые сигналы, а не пересказ каждого сообщения."
        ),
        (
            f"Есть треды обсуждений: {request.input.commentThreadsCount}. Их нужно отличать от одиночных комментариев."
            if request.input.commentThreadsCount > 0
            else "Треды ответов не обнаружены или не раскрыты в DOM."
        ),
    ]


def build_self_check(request: LearningRequest) -> list[str]:
    kind = request.input.currentStep.task.kind
    checks = [
        "Могу ли я своими словами объяснить, что спрашивает шаг?",
        "Проверил ли я ограничения формулировки, а не только знакомые слова?",
        "Не опираюсь ли я на feedback платформы вместо понимания материала?",
    ]

    if kind == "choice":
        return [
            "Могу ли я обосновать каждый выбранный и невыбранный вариант без подсказки?",
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
        return "Контекст ограничен текущим шагом: для более сильного ответа стоит открыть предыдущие шаги урока."

    return "Для backend mock достаточно текущего шага и посещенного контекста; AI позже сможет оценивать необходимость контекста точнее."


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
