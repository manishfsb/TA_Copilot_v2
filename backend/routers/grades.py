from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from backend.models.database import get_db, Submission, Assignment, QuestionGrade, ScoreChange
from backend.models.schemas import SubmissionOut, ScoreChangeOut

router = APIRouter(prefix="/grades", tags=["grades"])

# ────────── reads ────────────────────────────────────────────────────────

@router.get("/assignment/{assignment_id}", response_model=list[SubmissionOut])
async def get_grades_for_assignment(assignment_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Submission)
        .options(selectinload(Submission.question_grades))
        .where(Submission.assignment_id == assignment_id)
        .order_by(Submission.student_name)
    )
    return result.scalars().all()


@router.get("/submission/{submission_id}", response_model=SubmissionOut)
async def get_submission(submission_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Submission)
        .options(selectinload(Submission.question_grades))
        .where(Submission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    return submission


@router.get("/flagged", response_model=list[SubmissionOut])
async def get_flagged_submissions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Submission)
        .options(selectinload(Submission.question_grades))
        .where(Submission.flagged == True)
        .order_by(Submission.submitted_at.desc())
    )
    return result.scalars().all()


@router.get("/gradebook")
async def get_gradebook(db: AsyncSession = Depends(get_db)):
    """
    Returns the semester-wide gradebook: rows = students, cols = assignments.
    Computed live from submissions; no separate gradebook table.

    Output:
      {
        assignments: [{id, name}, ...],
        students: [{name, scores: {assignment_id: {total, max, pct, finalized}}}]
      }
    """
    a_result = await db.execute(select(Assignment).order_by(Assignment.created_at))
    assignments = a_result.scalars().all()

    s_result = await db.execute(
        select(Submission).order_by(Submission.student_name)
    )
    submissions = s_result.scalars().all()

    students = {}
    for sub in submissions:
        if sub.student_name not in students:
            students[sub.student_name] = {
                "name": sub.student_name,
                "student_id": sub.student_id,
                "scores": {}
            }
        # If we see the same student under multiple submissions, prefer a non-empty ID
        if sub.student_id and not students[sub.student_name].get("student_id"):
            students[sub.student_name]["student_id"] = sub.student_id

        pct = (
            round((sub.total_score / sub.max_score) * 100, 1)
            if sub.total_score is not None and sub.max_score
            else None
        )
        students[sub.student_name]["scores"][str(sub.assignment_id)] = {
            "submission_id": sub.id,
            "total": sub.total_score,
            "max": sub.max_score,
            "pct": pct,
            "finalized": sub.finalized,
            "flagged": sub.flagged,
        }

    return {
        "assignments": [{"id": a.id, "name": a.name} for a in assignments],
        "students": sorted(students.values(), key=lambda s: s["name"]),
    }


@router.get("/submission/{submission_id}/history", response_model=list[ScoreChangeOut])
async def get_score_history(submission_id: int, db: AsyncSession = Depends(get_db)):
    """Audit trail of every score change for this submission."""
    result = await db.execute(
        select(ScoreChange)
        .where(ScoreChange.submission_id == submission_id)
        .order_by(ScoreChange.changed_at.desc())
    )
    return result.scalars().all()


# ────────── writes ───────────────────────────────────────────────────────

@router.patch("/submission/{submission_id}/override")
async def override_score(
    submission_id: int,
    question_key: str,
    new_score: float,
    db: AsyncSession = Depends(get_db)
):
    """Allow TA to manually override a question score. Logged to audit trail."""
    result = await db.execute(
        select(QuestionGrade).where(
            QuestionGrade.submission_id == submission_id,
            QuestionGrade.question_key == question_key
        )
    )
    qg = result.scalar_one_or_none()
    if not qg:
        raise HTTPException(status_code=404, detail="Question grade not found")

    old_score = qg.score
    qg.score = new_score
    qg.flagged = False

    # Audit log
    db.add(ScoreChange(
        submission_id=submission_id,
        question_key=question_key,
        old_score=old_score,
        new_score=new_score,
        source="override"
    ))

    # Recompute total
    sub_result = await db.execute(
        select(Submission)
        .options(selectinload(Submission.question_grades))
        .where(Submission.id == submission_id)
    )
    submission = sub_result.scalar_one()
    submission.total_score = sum(q.score or 0 for q in submission.question_grades)
    submission.flagged = any(q.flagged for q in submission.question_grades)
    if not submission.flagged:
        submission.status = "done"
        submission.flag_reason = None

    await db.commit()
    return {"detail": "Score updated", "new_total": submission.total_score}


@router.patch("/submission/{submission_id}/feedback")
async def update_feedback(
    submission_id: int,
    question_key: str,
    feedback: str,
    db: AsyncSession = Depends(get_db)
):
    """Save TA's free-form comment for a specific question."""
    result = await db.execute(
        select(QuestionGrade).where(
            QuestionGrade.submission_id == submission_id,
            QuestionGrade.question_key == question_key
        )
    )
    qg = result.scalar_one_or_none()
    if not qg:
        raise HTTPException(status_code=404, detail="Question grade not found")
    qg.ta_feedback = feedback if feedback.strip() else None
    await db.commit()
    return {"detail": "Feedback saved"}


@router.post("/submission/{submission_id}/finalize")
async def finalize_submission(submission_id: int, db: AsyncSession = Depends(get_db)):
    """Mark a submission as finalized — locks the scoresheet for export."""
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    submission.finalized = True
    submission.finalized_at = datetime.utcnow()
    await db.commit()
    return {"detail": "Submission finalized", "finalized_at": submission.finalized_at}


@router.post("/submission/{submission_id}/unfinalize")
async def unfinalize_submission(submission_id: int, db: AsyncSession = Depends(get_db)):
    """Un-finalize so further edits are allowed (e.g. student disputes)."""
    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    submission.finalized = False
    submission.finalized_at = None
    await db.commit()
    return {"detail": "Submission unfinalized"}


@router.post("/submission/{submission_id}/regrade")
async def regrade_submission(
    submission_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """
    Re-run the grading pipeline on this submission against the assignment's
    current rubric. Deletes existing question_grades. Audit log preserved.
    Used after the TA fixes the rubric for an assignment that's already been graded.
    """
    result = await db.execute(
        select(Submission)
        .options(selectinload(Submission.question_grades))
        .where(Submission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    if submission.finalized:
        raise HTTPException(status_code=400, detail="Submission is finalized — unfinalize first")

    a_result = await db.execute(select(Assignment).where(Assignment.id == submission.assignment_id))
    assignment = a_result.scalar_one_or_none()
    if not assignment or not assignment.rubric:
        raise HTTPException(status_code=400, detail="Assignment has no rubric")

    # Delete existing question_grades (audit log entries persist)
    await db.execute(delete(QuestionGrade).where(QuestionGrade.submission_id == submission_id))
    submission.status = "pending"
    submission.total_score = None
    submission.max_score = None
    submission.confidence = None
    submission.flagged = False
    submission.flag_reason = None
    submission.graded_at = None
    await db.commit()

    # Fire grading in background using the same pipeline as initial upload
    from backend.routers.upload import _run_grading
    background_tasks.add_task(_run_grading, submission_id, assignment.rubric)
    return {"detail": "Re-grading queued"}
