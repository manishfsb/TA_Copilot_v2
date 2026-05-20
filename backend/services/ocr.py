import anthropic
import base64
import json
from backend.config import settings

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

def _build_ocr_prompt(expected_keys: list[str]) -> str:
    keys_hint = ""
    if expected_keys:
        keys_hint = f"""
The rubric for this assignment has exactly these question keys (use them verbatim as question_key values):
{json.dumps(expected_keys)}

Map every answer you find to the closest matching key from that list.
For example, if you see "Problem 1" → question_key "1", "2.1 (a)" → question_key "AT2.1a", "3. (b)" → question_key "3b".
Only use keys from the list above.
"""

    return f"""You are an expert OCR system for handwritten university statistics assignments.

Extract all written answers from these pages.{keys_hint}

For each question or sub-part you find, output a JSON object with:
- "question_key": string matching the rubric key list above (e.g. "1", "3a", "AT2.1b")
- "text": the full extracted answer as plain text, preserving all numbers, words, and mathematical steps
- "latex": any equations in LaTeX form (empty string if none)
- "confidence": float 0.0–1.0 reflecting how legible this section was (consider messy handwriting, smudges, ambiguous symbols)

Rules:
- Output EXACTLY ONE object per question_key from the rubric list. If the student's work for one question spans multiple sections, pages, or visual blocks (intermediate work + final answer, multiple derivations, etc.), COMBINE all of it into a single object's text field. Never produce two objects with the same question_key.
- Extract the student's COMPLETE answer for each question, including intermediate steps and tables.
- For tables: transcribe as tab-separated rows or describe the key values.
- For diagrams or sketches with no extractable numbers: set text to "(diagram)" and confidence to 1.0.
- Do NOT skip any question — if a question appears to be unanswered, still include it with text "(blank)".
- Rounding: extract numbers exactly as written (e.g. "7.089", not "7.09").

Common statistics symbols to watch for:
- x̄ or x-bar → \\bar{{x}}  (sample mean)
- s², σ² → variance
- s, σ → standard deviation
- Σ → \\sum (summation)
- √ → \\sqrt{{}}
- μ → population mean
- ŷ → \\hat{{y}} (predicted value)
- Subscripts: xᵢ → x_i

Return ONLY a valid JSON array. No markdown, no explanation."""


async def extract_text_from_pages(
    page_bytes_list: list[bytes],
    expected_keys: list[str] | None = None
) -> list[dict]:
    """
    Send all pages to Claude Vision and extract structured question answers.
    Pass expected_keys from the rubric so the model labels answers consistently.
    """
    image_content = []
    for i, page_bytes in enumerate(page_bytes_list):
        b64 = base64.standard_b64encode(page_bytes).decode("utf-8")
        image_content.append({"type": "text", "text": f"--- Page {i + 1} ---"})
        image_content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/png", "data": b64}
        })

    image_content.append({
        "type": "text",
        "text": _build_ocr_prompt(expected_keys or [])
    })

    response = client.messages.create(
        model=settings.ocr_model,
        max_tokens=4096,
        messages=[{"role": "user", "content": image_content}]
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    try:
        results = json.loads(raw.strip())
        # Normalise field name: accept both question_key and legacy question_number
        for item in results:
            if "question_number" in item and "question_key" not in item:
                item["question_key"] = str(item.pop("question_number"))
        return results
    except (json.JSONDecodeError, TypeError):
        return []
