from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, JSON
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase, relationship
from datetime import datetime

DATABASE_URL = "sqlite+aiosqlite:///./autograder.db"

engine = create_async_engine(DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    solution_set_path = Column(String, nullable=False)
    # Parsed rubric stored as JSON list of rubric item dicts (with TA-assigned max_score)
    rubric = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    submissions = relationship("Submission", back_populates="assignment", cascade="all, delete-orphan")

class Submission(Base):
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=False)
    student_name = Column(String, nullable=False)      # pseudonym shown in UI (e.g. "S-001")
    student_id = Column(String, nullable=True, index=True)  # TA's stable ID for cross-referencing
    file_path = Column(String, nullable=False)
    status = Column(String, default="pending")   # pending | grading | done | flagged
    total_score = Column(Float, nullable=True)
    max_score = Column(Float, nullable=True)
    confidence = Column(Float, nullable=True)
    flagged = Column(Boolean, default=False)
    flag_reason = Column(Text, nullable=True)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    graded_at = Column(DateTime, nullable=True)
    finalized = Column(Boolean, default=False)
    finalized_at = Column(DateTime, nullable=True)
    # Live progress: the question key currently being graded, or None when idle.
    # Surfaced in the Results loader as "Grading Problem 1 (a)...".
    current_question_key = Column(String, nullable=True)
    current_question_label = Column(String, nullable=True)

    assignment = relationship("Assignment", back_populates="submissions")
    question_grades = relationship("QuestionGrade", back_populates="submission", cascade="all, delete-orphan")
    score_changes = relationship("ScoreChange", back_populates="submission", cascade="all, delete-orphan")

class QuestionGrade(Base):
    __tablename__ = "question_grades"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=False)
    # String key like "1", "1a", "AT2.1b" matching rubric question_key
    question_key = Column(String, nullable=False)
    problem_label = Column(String, nullable=True)   # human-readable label for display
    sub_part = Column(String, nullable=True)
    extracted_text = Column(Text, nullable=True)
    score = Column(Float, nullable=True)
    max_score = Column(Float, nullable=True)
    explanation = Column(Text, nullable=True)
    confidence = Column(Float, nullable=True)
    flagged = Column(Boolean, default=False)
    manually_graded = Column(Boolean, default=False)   # diagram answers
    ta_feedback = Column(Text, nullable=True)   # TA's free-form per-question comment

    submission = relationship("Submission", back_populates="question_grades")


class ScoreChange(Base):
    """Audit log: every score change is recorded for grade-dispute traceability."""
    __tablename__ = "score_changes"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=False)
    question_key = Column(String, nullable=False)
    old_score = Column(Float, nullable=True)
    new_score = Column(Float, nullable=False)
    source = Column(String, nullable=False)   # "auto" | "override" | "regrade"
    changed_at = Column(DateTime, default=datetime.utcnow)

    submission = relationship("Submission", back_populates="score_changes")


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db() -> AsyncSession:
    async with SessionLocal() as session:
        yield session
