from __future__ import annotations

from .config import Settings
from .models import LearningRequest


class PayloadLimitError(Exception):
    pass


def validate_learning_request_limits(request: LearningRequest, settings: Settings) -> None:
    current_markdown_length = len(request.input.currentStep.markdown)
    if current_markdown_length > settings.max_current_step_markdown_chars:
        raise PayloadLimitError(
            f"currentStep.markdown is too large: {current_markdown_length} > {settings.max_current_step_markdown_chars}"
        )

    previous_steps_count = len(request.input.previousSteps)
    if previous_steps_count > settings.max_previous_steps:
        raise PayloadLimitError(
            f"previousSteps is too large: {previous_steps_count} > {settings.max_previous_steps}"
        )

    for index, previous_step in enumerate(request.input.previousSteps):
        previous_markdown_length = len(previous_step.markdown)
        if previous_markdown_length > settings.max_previous_step_markdown_chars:
            raise PayloadLimitError(
                f"previousSteps[{index}].markdown is too large: "
                f"{previous_markdown_length} > {settings.max_previous_step_markdown_chars}"
            )

    comments_count = len(request.input.comments)
    if comments_count > settings.max_comments:
        raise PayloadLimitError(f"comments is too large: {comments_count} > {settings.max_comments}")

    for index, comment in enumerate(request.input.comments):
        comment_length = len(comment)
        if comment_length > settings.max_comment_chars:
            raise PayloadLimitError(
                f"comments[{index}] is too large: {comment_length} > {settings.max_comment_chars}"
            )

    total_chars = (
        len(request.instruction)
        + current_markdown_length
        + sum(len(step.markdown) for step in request.input.previousSteps)
        + sum(len(comment) for comment in request.input.comments)
    )
    if total_chars > settings.max_total_request_chars:
        raise PayloadLimitError(
            f"request text is too large: {total_chars} > {settings.max_total_request_chars}"
        )
