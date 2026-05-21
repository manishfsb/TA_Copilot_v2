# Copilot for Teaching Assistants  V2

An LLM-powered grading copilot for handwritten engineering homework. Built to offload the routine question scoring from TAs so they can spend their time only on the diagrams and low-confidence pages the system explicitly flags.

Originally built for 'Statistical Analysis of Engineering Systems' - a 40-student class with weekly handwritten assignments.

---

## Walkthrough

![TA Copilot walkthrough](./gifs/TA_Copilot.gif)

The TA uploads a solution set, reviews the auto-extracted rubric, drops in student papers, and reviews the results. Flagged papers (low-confidence OCR or diagram answers) are surfaced at the top of the dashboard so they get attention first.

---

## What it does

1. **Parses the solution set.** Drop a PDF or `.docx`; Claude Vision extracts each problem and sub-part into a structured rubric. The TA reviews and edits before grading starts.
2. **Preprocesses student papers.** OpenCV deskews, denoises, and adaptively binarizes each page so handwriting is legible to the model.
3. **OCRs handwriting.** Claude Haiku Vision extracts text per question, mapping every answer to the rubric's question keys. Low-confidence pages escalate to Sonnet.
4. **Grades against the rubric.** SymPy short-circuits any symbolic answers it can verify directly; otherwise Claude scores against the rubric using 7 few-shot calibration examples drawn from real graded papers, applying the course's 75% partial-credit convention.
5. **Flags edge cases for review.** Diagram answers, low-OCR submissions, and paper-wide presentation issues all surface in a "Needs Manual Review" section. The TA overrides scores, leaves per-question feedback, and finalizes.
6. **Exports for the gradebook.** Once finalized, scores roll up into a semester-wide gradebook with CSV download.

---

## Key features

- **Solution-set rubric caching** - re-uploading a solution set reuses the previously approved rubric instead of re-parsing.
- **Per-question confidence scoring** - every extracted answer has a confidence value; anything below threshold is flagged.
- **Presentation penalty detection** - paper-wide low confidence (<0.60) surfaces a suggested manual deduction without auto-applying it.
- **Audit trail** - every score change (auto, override, regrade) is logged for grade-dispute traceability.
- **Finalize / unfinalize workflow** - locks the scoresheet once the TA confirms; re-openable if a student disputes.
- **Score distribution view** - per-assignment histogram so you can see class performance at a glance.

---

## Architecture

```
React (Vite + Tailwind, :5173)
  ├─ Dashboard, Upload wizard, Results, Scoresheet, Gradebook, EditRubric
  └─ Polls live grading progress; sticky PDF viewer with cache-busted iframe

FastAPI (:8000)
  ├─ /assignments - CRUD + rubric preview
  ├─ /upload      - student submission + background grading task
  ├─ /grades      - overrides, finalize, regrade, gradebook
  └─ /files       - serve PDFs/images inline

Services
  ├─ preprocessor.py    OpenCV deskew + denoise + binarize
  ├─ solution_parser.py Claude Vision → structured rubric
  ├─ ocr.py             Claude Haiku Vision on student pages
  ├─ math_equiv.py      SymPy symbolic equivalence (free fast path)
  └─ grader.py          Claude grading with 7 few-shot examples + prompt caching

SQLite (autograder.db)
  assignments · submissions · question_grades · score_changes
```

A single asyncio semaphore serializes grading jobs end-to-end, eliminating API rate-limit risk under batch uploads and making progress visualization trivial - exactly 0 or 1 submission has status `grading` at any moment.

---

## Quick start

```bash
# One-time setup
source .venv/bin/activate
pip install -r backend/requirements.txt
cd frontend && npm install && cd ..
npm install                       # root: dev launcher

# Set your API key
cp .env.example .env              # then edit, add ANTHROPIC_API_KEY

# Run
npm run dev                       # backend on :8000, frontend on :5173
npm run stop                      # kill both
npm run backup                    # timestamped SQLite backup (keeps last 7)
```

Open http://localhost:5173.

---

## Configuration

In `.env`:

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | - | Required |
| `OCR_MODEL` | `claude-haiku-4-5-20251001` | Vision OCR |
| `GRADING_MODEL` | `claude-haiku-4-5-20251001` | Bulk grading |
| `ESCALATION_MODEL` | `claude-sonnet-4-6` | Diagrams + low-confidence pages |
| `CONFIDENCE_THRESHOLD` | `0.75` | Below this, OCR escalates to Sonnet |

---

## Tech stack

**Backend** FastAPI · SQLAlchemy (async) · SQLite · OpenCV · SymPy · pdf2image · Anthropic Python SDK
**Frontend** React 18 · Vite · Tailwind · React Router
**Models** Claude Haiku 4.5 (OCR + bulk grading) · Claude Sonnet 4.6 (escalation)
