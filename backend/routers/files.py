"""
Serve uploaded files (student submissions, solution sets) to the frontend.

Security: file paths are NEVER taken from the URL. The URL only carries the
submission/assignment ID; the actual filesystem path is looked up in the DB.
This prevents path traversal attacks.
"""

import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.models.database import get_db, Assignment, Submission

router = APIRouter(prefix="/files", tags=["files"])


def _guess_media_type(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    return {
        ".pdf":  "application/pdf",
        ".png":  "image/png",
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }.get(ext, "application/octet-stream")


def _inline_response(path: str) -> FileResponse:
    """Serve a file with Content-Disposition: inline so the browser renders it
    in an iframe instead of triggering a download.

    Cache-Control: no-store prevents the browser from caching the file, so that
    when a new submission is uploaded the iframe never displays a stale version.
    """
    filename = os.path.basename(path)
    return FileResponse(
        path,
        media_type=_guess_media_type(path),
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "no-store",
        }
    )


@router.get("/submission/{submission_id}")
async def get_submission_file(submission_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Submission).where(Submission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    if not os.path.exists(submission.file_path):
        raise HTTPException(status_code=404, detail="File missing on disk")
    return _inline_response(submission.file_path)


@router.get("/solution/{assignment_id}")
async def get_solution_file(assignment_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Assignment).where(Assignment.id == assignment_id)
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if not os.path.exists(assignment.solution_set_path):
        raise HTTPException(status_code=404, detail="Solution file missing on disk")
    return _inline_response(assignment.solution_set_path)
