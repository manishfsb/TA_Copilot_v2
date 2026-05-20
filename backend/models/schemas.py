from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class QuestionGradeOut(BaseModel):
    id: int
    question_key: str
    problem_label: Optional[str]
    sub_part: Optional[str]
    extracted_text: Optional[str]
    score: Optional[float]
    max_score: Optional[float]
    explanation: Optional[str]
    confidence: Optional[float]
    flagged: bool
    manually_graded: bool
    ta_feedback: Optional[str] = None

    class Config:
        from_attributes = True

class SubmissionOut(BaseModel):
    id: int
    assignment_id: int
    student_name: str
    student_id: Optional[str] = None
    status: str
    total_score: Optional[float]
    max_score: Optional[float]
    confidence: Optional[float]
    flagged: bool
    flag_reason: Optional[str]
    submitted_at: datetime
    graded_at: Optional[datetime]
    finalized: bool = False
    finalized_at: Optional[datetime] = None
    current_question_key: Optional[str] = None
    current_question_label: Optional[str] = None
    question_grades: list[QuestionGradeOut] = []

    class Config:
        from_attributes = True

class ScoreChangeOut(BaseModel):
    id: int
    question_key: str
    old_score: Optional[float]
    new_score: float
    source: str
    changed_at: datetime

    class Config:
        from_attributes = True

class AssignmentOut(BaseModel):
    id: int
    name: str
    solution_set_path: str
    rubric: Optional[list[dict]] = None
    created_at: datetime
    submissions: list[SubmissionOut] = []

    class Config:
        from_attributes = True

class GradingResult(BaseModel):
    question_key: str
    problem_label: str
    sub_part: Optional[str]
    extracted_text: str
    score: float
    max_score: float
    explanation: str
    confidence: float
    flagged: bool
    manually_graded: bool = False

# A single rubric item as parsed from the solution set + TA point values
class RubricItem(BaseModel):
    question_key: str
    problem_label: str
    sub_part: Optional[str] = None
    correct_answer: str
    answer_type: str                   # numerical | explanation | table | set | diagram | mixed
    gradeable: bool = True             # False for diagram-only answers
    key_values: list[float] = []       # extracted numerical answers for fast comparison
    max_score: float = 0.0            # TA assigns this in the UI
