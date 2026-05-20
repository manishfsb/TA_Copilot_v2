"""
Parse a solution set PDF or docx into a structured rubric using Claude Vision.

The solution set is sent page-by-page to Claude, which extracts every problem
and sub-part into a structured JSON format. This handles arbitrary formatting,
mixed equation/table/diagram content, and labeling conventions like
"Problem 1", "Ang and Tang problem 2.1", etc.

Point values are NOT extracted here — they are assigned by the TA in the UI.
"""

import anthropic
import base64
import json
import pdf2image
import numpy as np
from pathlib import Path
from PIL import Image
import io
from backend.config import settings

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

PARSE_PROMPT = """You are parsing a university statistics course solution set.
Extract EVERY problem and sub-part from these pages into a structured JSON rubric.

For each gradeable item output an object with:
- "question_key": unique string identifier combining problem and sub-part, e.g. "1", "1a", "1b", "AT2.1a", "AT2.4c"
- "problem_label": the problem label as written, e.g. "Problem 1", "Ang and Tang 2.1"
- "sub_part": the sub-part letter if present ("a", "b", "c", ...), or null for top-level answers
- "correct_answer": the full answer text. For equations use plain text with symbols (e.g. x_bar = 16, s^2 = 50.25). For set answers write them out. For table answers summarize the key values.
- "answer_type": one of "numerical" | "explanation" | "table" | "set" | "diagram" | "mixed"
- "gradeable": false ONLY if the answer is purely a hand-drawn diagram with no extractable text/numbers. true for everything else.
- "key_values": list of important numerical answers if answer_type is numerical or mixed (e.g. [16, 50.25, 7.09]). Empty list otherwise.

Rules:
- A "sub-part" means a part EXPLICITLY labelled with (a), (b), (c), (d) in the solution set. Different calculation steps within ONE problem (e.g. mean → variance → std dev) are NOT sub-parts. They are intermediate steps of a single answer. Combine them into one object.
- If a problem has explicit sub-parts (a), (b), (c), create a SEPARATE object for EACH sub-part.
- Even if a sub-part's answer is purely a diagram with no text, INCLUDE IT. Write the correct_answer as a description of what the diagram should show (e.g. "Sketch of sample space: rectangle with V on x-axis from 0 to ∞, θ on y-axis from 0° to 90°").
- If a problem has no sub-parts, create ONE object for the whole problem — even if it contains multiple equations or computations.
- Do NOT create a parent object for a problem that has sub-parts — only leaf-level items.
- NEVER output two items with the same question_key. NEVER output two items with the same problem_label AND sub_part combination. If you're tempted to, combine them into one.
- Diagram-only sub-parts should still appear in the rubric with answer_type="diagram" and gradeable=true. Describe what the diagram represents in correct_answer so the TA can verify against the student's drawing.
- Be generous with correct_answer — include all relevant content, not just the final number.
- Preserve mathematical relationships exactly as in the solution (e.g. "A = E_1 ∩ E_3", not "A = E_1 ∩ E_2"). Double-check intersections, unions, and subscripts.
- Preserve mathematical equations (e.g. "x_bar = sum(xi)/n = 144/9 = 16").

VERIFICATION STEP before returning JSON:
1. Did you create one object per sub-part labelled (a), (b), (c), (d)? Count them.
2. For diagram-heavy problems like sample space sketches, did you include EVERY sub-part even if the answer is a sketch?
3. Are the subscripts and set operations (∩, ∪) accurate? E.g. "A = E_1 ∩ E_3" vs "A = E_1 ∩ E_2" are different answers.

Return ONLY a valid JSON array. No markdown, no explanation."""


def _pdf_to_png_bytes(pdf_path: str) -> list[bytes]:
    pages = pdf2image.convert_from_path(pdf_path, dpi=150)
    result = []
    for page in pages:
        buf = io.BytesIO()
        page.save(buf, format="PNG")
        result.append(buf.getvalue())
    return result


def _docx_to_png_bytes(docx_path: str) -> list[bytes]:
    """Convert docx to images via PDF intermediate using LibreOffice if available, else extract text only."""
    import subprocess, tempfile, os
    with tempfile.TemporaryDirectory() as tmpdir:
        result = subprocess.run(
            ["libreoffice", "--headless", "--convert-to", "pdf", "--outdir", tmpdir, docx_path],
            capture_output=True
        )
        pdf_name = Path(docx_path).stem + ".pdf"
        pdf_path = os.path.join(tmpdir, pdf_name)
        if result.returncode == 0 and os.path.exists(pdf_path):
            return _pdf_to_png_bytes(pdf_path)
    # Fallback: extract plain text from docx and send as a single text block
    return []


def _build_vision_content(page_bytes_list: list[bytes]) -> list[dict]:
    content = []
    for i, page_bytes in enumerate(page_bytes_list):
        b64 = base64.standard_b64encode(page_bytes).decode()
        content.append({"type": "text", "text": f"--- Page {i + 1} ---"})
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/png", "data": b64}
        })
    content.append({"type": "text", "text": PARSE_PROMPT})
    return content


def _fallback_docx_text_parse(docx_path: str) -> list[dict]:
    """Plain text extraction from docx when LibreOffice is not available."""
    from docx import Document
    import re

    doc = Document(docx_path)
    full_text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())

    response = client.messages.create(
        model=settings.ocr_model,
        max_tokens=4096,
        messages=[{
            "role": "user",
            "content": f"Here is the text of a statistics solution set:\n\n{full_text}\n\n{PARSE_PROMPT}"
        }]
    )
    return _parse_response(response.content[0].text)


def _dedupe_rubric(items: list[dict]) -> list[dict]:
    """
    Safety net: if Claude returns multiple rubric items with the same logical
    identity (question_key OR (problem_label + sub_part)), merge them.

    The bug being defended against: Claude sometimes splits a multi-step
    answer (e.g. mean → variance → std dev for Problem 1) into separate
    items even though Problem 1 has no sub-parts. Without dedup, each
    "phantom sub-part" gets its own grading row and inflates the max score.
    """
    by_key: dict[str, dict] = {}
    by_label_sub: dict[tuple, dict] = {}

    for item in items:
        key = str(item["question_key"]).strip()
        label_sub = (str(item.get("problem_label", "")).strip(), item.get("sub_part") or "")

        if key in by_key:
            _merge_rubric_items(by_key[key], item)
            continue
        if label_sub in by_label_sub:
            _merge_rubric_items(by_label_sub[label_sub], item)
            continue

        by_key[key] = item
        by_label_sub[label_sub] = item

    return list(by_key.values())


def _merge_rubric_items(target: dict, extra: dict) -> None:
    """Concatenate correct_answer and merge key_values from a duplicate item."""
    if extra.get("correct_answer") and extra["correct_answer"] not in target.get("correct_answer", ""):
        target["correct_answer"] = (target.get("correct_answer", "") + "\n" + extra["correct_answer"]).strip()
    target_vals = target.get("key_values") or []
    extra_vals = extra.get("key_values") or []
    target["key_values"] = list(dict.fromkeys(target_vals + extra_vals))   # de-duped, order preserved


def _parse_response(raw: str) -> list[dict]:
    raw = raw.strip()
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        items = json.loads(raw.strip())
        # Validate required fields
        valid = []
        for item in items:
            if "question_key" in item and "correct_answer" in item:
                item.setdefault("sub_part", None)
                item.setdefault("answer_type", "mixed")
                item.setdefault("gradeable", True)
                item.setdefault("key_values", [])
                item.setdefault("problem_label", item["question_key"])
                valid.append(item)
        return _dedupe_rubric(valid)
    except (json.JSONDecodeError, TypeError):
        return []


async def parse_solution_set(file_path: str) -> list[dict]:
    """
    Main entry point. Accepts PDF or docx. Returns list of rubric item dicts.
    Point values (max_score) are not set here — they default to 0 for TA to fill in.
    """
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        page_bytes = _pdf_to_png_bytes(file_path)
    elif suffix == ".docx":
        page_bytes = _docx_to_png_bytes(file_path)
    else:
        raise ValueError(f"Unsupported solution set format: {suffix}")

    if not page_bytes:
        # Fallback for docx without LibreOffice
        return _fallback_docx_text_parse(file_path)

    content = _build_vision_content(page_bytes)
    response = client.messages.create(
        model=settings.ocr_model,
        max_tokens=4096,
        messages=[{"role": "user", "content": content}]
    )
    items = _parse_response(response.content[0].text)

    for item in items:
        item["max_score"] = 100.0

    return items
