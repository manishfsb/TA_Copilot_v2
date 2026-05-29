import asyncio
import os
import shutil
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from backend.models.database import get_db, Assignment, Submission, QuestionGrade, ScoreChange
from backend.models.schemas import SubmissionOut
from backend.services.preprocessor import prepare_submission
from backend.services.ocr import extract_text_from_pages
from backend.services.grader import grade_submission

router = APIRouter(prefix="/upload", tags=["upload"])

UPLOAD_DIR = "./uploads"

# ──────────────────────────────────────────────────────────────────────────────
# Serial grading. Only ONE grading job runs at a time across the whole process.
# This eliminates rate-limit risk and makes progress visualization trivial:
# at any moment exactly 0 or 1 submission has status="grading".
# ──────────────────────────────────────────────────────────────────────────────
_GRADING_SEMAPHORE = asyncio.Semaphore(1)


@router.post("/{assignment_id}", response_model=SubmissionOut)
async def upload_submission(
    assignment_id: int,
    student_name: str = Form(...),
    student_id: str = Form(""),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Assignment).where(Assignment.id == assignment_id))
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    if not assignment.rubric:
        raise HTTPException(status_code=400, detail="Assignment has no rubric. Edit the assignment and add a rubric first.")

    # Per-assignment folder: uploads/assignment_1/ → easier backup, cleanup, navigation.
    # UUID prefix guarantees no filename collisions even if two papers share both
    # student_name AND original filename (which silently overwrote each other before).
    assignment_dir = os.path.join(UPLOAD_DIR, f"assignment_{assignment_id}")
    os.makedirs(assignment_dir, exist_ok=True)
    safe_name = student_name.replace(" ", "_")
    unique_id = uuid.uuid4().hex[:8]
    filename = f"{safe_name}_{unique_id}_{file.filename}"
    save_path = os.path.join(assignment_dir, filename)
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    submission = Submission(
        assignment_id=assignment_id,
        student_name=student_name,
        student_id=student_id.strip() or None,
        file_path=save_path,
        status="pending"
    )
    db.add(submission)
    await db.commit()

    result = await db.execute(
        select(Submission)
        .options(selectinload(Submission.question_grades))
        .where(Submission.id == submission.id)
    )
    submission = result.scalar_one()

    background_tasks.add_task(_run_grading, submission.id, assignment.rubric)
    return submission


async def _run_grading(submission_id: int, rubric: list[dict]):
    """Grading runs strictly one-at-a-time. If multiple uploads arrive at once,
    they queue here on the semaphore in FIFO order."""
    async with _GRADING_SEMAPHORE:
        await _run_grading_inner(submission_id, rubric)


async def _run_grading_inner(submission_id: int, rubric: list[dict]):
    from backend.models.database import SessionLocal
    async with SessionLocal() as db:
        result = await db.execute(
            select(Submission)
            .options(selectinload(Submission.question_grades))
            .where(Submission.id == submission_id)
        )
        submission = result.scalar_one_or_none()
        if not submission:
            return

        submission.status = "grading"
        await db.commit()

        try:
            expected_keys = [item["question_key"] for item in rubric if item.get("gradeable", True)]
            page_bytes = prepare_submission(submission.file_path)
            ocr_results = await extract_text_from_pages(page_bytes, expected_keys=expected_keys)

            if not ocr_results:
                submission.status = "flagged"
                submission.flagged = True
                submission.flag_reason = "OCR returned no text - file may be unreadable or blank"
                await db.commit()
                return

            # Update DB before each question is graded - surfaces in the Results loader
            async def on_question_start(q_key: str, label: str):
                submission.current_question_key = q_key
                submission.current_question_label = label
                await db.commit()

            graded = await grade_submission(ocr_results, rubric, on_question_start=on_question_start)
            # Clear progress field once done
            submission.current_question_key = None
            submission.current_question_label = None

            total = 0.0
            max_total = 0.0
            min_confidence = 1.0

            for g in graded:
                qg = QuestionGrade(
                    submission_id=submission_id,
                    question_key=g.question_key,
                    problem_label=g.problem_label,
                    sub_part=g.sub_part,
                    extracted_text=g.extracted_text,
                    score=g.score,
                    max_score=g.max_score,
                    explanation=g.explanation,
                    confidence=g.confidence,
                    flagged=g.flagged,
                    manually_graded=g.manually_graded
                )
                db.add(qg)
                # Log initial grade for audit trail
                db.add(ScoreChange(
                    submission_id=submission_id,
                    question_key=g.question_key,
                    old_score=None,
                    new_score=g.score,
                    source="auto"
                ))
                total += g.score
                max_total += g.max_score
                if g.confidence is not None:
                    min_confidence = min(min_confidence, g.confidence)

            any_flagged = any(g.flagged for g in graded)
            avg_confidence = (
                sum(g.confidence for g in graded if g.confidence is not None) / len(graded)
                if graded else 1.0
            )

            # Presentation flag: paper-wide low confidence signals disorganized/hard-to-read submission
            # The TA may want to apply a presentation penalty (e.g. -5 pts) independently of content scores
            PRESENTATION_THRESHOLD = 0.60
            presentation_warning = avg_confidence < PRESENTATION_THRESHOLD

            flag_reasons = []
            if any_flagged:
                flag_reasons.append("One or more answers need manual review (low OCR confidence or diagram answer)")
            if presentation_warning:
                flag_reasons.append(
                    f"Paper-wide OCR confidence is low ({round(avg_confidence * 100)}%) - "
                    "paper may be disorganized or hard to read. Consider a presentation penalty."
                )

            submission.total_score = round(total, 2)
            submission.max_score = round(max_total, 2)
            submission.confidence = round(avg_confidence, 3)
            submission.flagged = any_flagged or presentation_warning
            submission.flag_reason = " | ".join(flag_reasons) if flag_reasons else None
            submission.status = "flagged" if (any_flagged or presentation_warning) else "done"
            submission.graded_at = datetime.utcnow()
            await db.commit()

        except Exception as e:
            submission.status = "flagged"
            submission.flagged = True
            submission.flag_reason = f"Grading error: {str(e)}"
            await db.commit()
