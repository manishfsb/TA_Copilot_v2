import json
import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from backend.models.database import get_db, Assignment, Submission
from backend.models.schemas import AssignmentOut
from backend.services.solution_parser import parse_solution_set

router = APIRouter(prefix="/assignments", tags=["assignments"])

SOLUTION_DIR = "./solution_sets"
ALLOWED_EXTENSIONS = {".pdf", ".docx"}


def _check_extension(filename: str):
    from pathlib import Path
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Solution set must be a PDF or .docx file")
    return ext


@router.post("/preview-rubric")
async def preview_rubric(solution_file: UploadFile = File(...)):
    """
    Step 1 of assignment creation: upload the solution set and get back a
    parsed rubric for TA review. Nothing is saved to the DB yet.
    Point values (max_score) default to 0 - the TA sets them in the UI.
    """
    _check_extension(solution_file.filename)

    os.makedirs(SOLUTION_DIR, exist_ok=True)
    tmp_path = os.path.join(SOLUTION_DIR, f"_preview_{solution_file.filename}")
    with open(tmp_path, "wb") as f:
        shutil.copyfileobj(solution_file.file, f)

    try:
        rubric = await parse_solution_set(tmp_path)
    finally:
        # Keep the file so the TA can confirm and create the assignment
        pass

    return {"tmp_path": tmp_path, "rubric": rubric}


@router.post("/", response_model=AssignmentOut)
async def create_assignment(
    name: str = Form(...),
    solution_tmp_path: str = Form(...),    # path returned by /preview-rubric
    rubric_json: str = Form(...),           # TA-reviewed rubric JSON string
    db: AsyncSession = Depends(get_db)
):
    """
    Step 2 of assignment creation: save the assignment with the TA-approved rubric.
    The rubric_json must be a JSON array of rubric items with max_score filled in.
    """
    if not os.path.exists(solution_tmp_path):
        raise HTTPException(status_code=400, detail="Solution file not found. Re-upload the solution set.")

    # Move the temp file to its permanent location
    from pathlib import Path
    filename = Path(solution_tmp_path).name.removeprefix("_preview_")
    permanent_path = os.path.join(SOLUTION_DIR, filename)
    shutil.move(solution_tmp_path, permanent_path)

    try:
        rubric = json.loads(rubric_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid rubric JSON")

    assignment = Assignment(name=name, solution_set_path=permanent_path, rubric=rubric)
    db.add(assignment)
    await db.commit()

    # Re-fetch with relationships loaded - db.refresh() alone won't load them
    # and SQLAlchemy async can't lazy-load outside the greenlet context
    result = await db.execute(
        select(Assignment)
        .options(selectinload(Assignment.submissions).selectinload(Submission.question_grades))
        .where(Assignment.id == assignment.id)
    )
    return result.scalar_one()


@router.get("/", response_model=list[AssignmentOut])
async def list_assignments(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Assignment)
        .options(selectinload(Assignment.submissions).selectinload(Submission.question_grades))
        .order_by(Assignment.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{assignment_id}", response_model=AssignmentOut)
async def get_assignment(assignment_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Assignment)
        .options(selectinload(Assignment.submissions).selectinload(Submission.question_grades))
        .where(Assignment.id == assignment_id)
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment


@router.put("/{assignment_id}/rubric", response_model=AssignmentOut)
async def update_rubric(
    assignment_id: int,
    rubric_json: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Update an assignment's rubric after creation. Used when the TA discovers
    parser errors mid-grading (e.g. Claude missed a sub-part).

    Existing question_grades are NOT auto-invalidated - the TA explicitly
    triggers re-grade per submission via POST /grades/submission/{id}/regrade.
    """
    result = await db.execute(select(Assignment).where(Assignment.id == assignment_id))
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    try:
        rubric = json.loads(rubric_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid rubric JSON")

    assignment.rubric = rubric
    await db.commit()

    result = await db.execute(
        select(Assignment)
        .options(selectinload(Assignment.submissions).selectinload(Submission.question_grades))
        .where(Assignment.id == assignment_id)
    )
    return result.scalar_one()


@router.delete("/{assignment_id}")
async def delete_assignment(assignment_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Assignment).where(Assignment.id == assignment_id))
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await db.delete(assignment)
    await db.commit()
    return {"detail": "Deleted"}
