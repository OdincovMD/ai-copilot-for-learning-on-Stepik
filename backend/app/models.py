from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


LearningMode = Literal["explain", "hint", "notes"]
StepKind = Literal["choice", "code", "text", "video", "unknown"]


class Guardrails(BaseModel):
    noDirectAnswers: Literal[True]
    noMultipleChoiceOptionLeak: Literal[True]
    focusOnUnderstanding: Literal[True]


class StepMetadata(BaseModel):
    courseTitle: str | None = None
    lessonTitle: str | None = None
    stepTitle: str | None = None


class StepTask(BaseModel):
    kind: StepKind
    hasAnswerControls: bool
    hasChoiceOptions: bool
    hasCodeEditor: bool
    answerOptionsCount: int | None = None


class CurrentStepInput(BaseModel):
    url: str
    title: str | None = None
    markdown: str
    metadata: StepMetadata
    task: StepTask


class PreviousStepInput(BaseModel):
    url: str
    title: str | None = None
    markdown: str
    metadata: StepMetadata


class LearningInput(BaseModel):
    currentStep: CurrentStepInput
    previousSteps: list[PreviousStepInput]
    comments: list[str]
    commentThreadsCount: int


class ExpectedOutput(BaseModel):
    summary: str
    focusPoints: list[str]
    commentInsights: list[str]
    selfCheck: list[str]
    needsMoreContext: str


class LearningRequest(BaseModel):
    version: Literal["learning-request-v1"]
    mode: LearningMode
    language: Literal["ru"]
    instruction: str
    guardrails: Guardrails
    input: LearningInput
    expectedOutput: ExpectedOutput


class LearningAnalysis(BaseModel):
    version: Literal["learning-analysis-v1"]
    mode: LearningMode
    source: Literal["backend-mock", "openai", "groq", "ollama"]
    summary: str
    focusPoints: list[str]
    commentInsights: list[str]
    selfCheck: list[str]
    needsMoreContext: str
    warnings: list[str]
