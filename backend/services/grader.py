import json
import anthropic
from backend.config import settings
from backend.models.schemas import GradingResult
from backend.services.math_equiv import are_mathematically_equivalent

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

# ---------------------------------------------------------------------------
# Few-shot calibration examples drawn from actual graded CAEE 361 HW1 papers.
# These teach the model the TA's grading philosophy and the 75% partial credit
# convention used in this course.
# ---------------------------------------------------------------------------
FEW_SHOT_EXAMPLES = """
Below are REAL grading examples from this course. Use them to calibrate your scores.

--- EXAMPLE 1: Numerical answer, minor rounding difference → FULL CREDIT ---
Question: Problem 1 (sample std dev)
Correct answer: s = √50.25 = 7.09
Student wrote: "s = √s² = √50.25 = 7.089"
Score awarded: 100% (full credit)
Reason: 7.089 rounds to 7.09. Rounding differences within ±0.01 always get full credit.

--- EXAMPLE 2: Explanation answer, imprecise phrasing but correct concept → FULL CREDIT ---
Question: Problem 2 (Var.P vs Var.S)
Correct answer: Var.P divides by n (population, smaller estimate). Var.S divides by n-1 (sample, larger estimate).
Student wrote: "The .S versions gave the same results found for Question #1. The .P versions are larger since they account for a whole population, which would have greater variation than that of a sample."
Score awarded: 100% (full credit)
Reason: Student demonstrated understanding of the population vs. sample distinction and why the functions differ. For explanation questions, award full credit if the core statistical concept is present, even if the phrasing is imprecise or the direction is stated unclearly.

--- EXAMPLE 3: Set/table answer, one of two required items wrong → 75% CREDIT ---
Question: Ang and Tang 2.1 (a) - sample space of travel time from A to C
Correct answer: T(A→C) = {8, 9, 10, 11, 12, 13, 14}
Student wrote: listed {6,7,9,10,11} for A→B (correct) but listed only the B→C segment times {2,3} instead of the total A→C travel times
Score awarded: 75%
Reason: One of two required sample spaces was incorrect. The standard partial credit deduction in this course is 25% per significant error within a sub-part.

--- EXAMPLE 4: Diagram answer, one element drawn incorrectly → 75% CREDIT ---
Question: Ang and Tang 2.3 (b) - shade events E1, E2, E3 on sample space plot
Correct answer: E1=(V>35kph), E2=(15<V≤45kph), E3=(θ≤30°) all correctly shaded
Student drew: E1 and E2 correctly, but E3 region was drawn in the wrong area
Score awarded: 75%
Reason: Two of three events correct. Same 25% per significant error convention.

--- EXAMPLE 5: Histogram with frequency table → FULL CREDIT ---
Question: Problem 4 (a) - construct histogram with 4 bins
Correct answer: 0-8: 1/9=0.11, 9-16: 4/9=0.44, 17-24: 3/9=0.33, 25-32: 1/9=0.11
Student answer: Frequency table with all correct bin boundaries and fractions, plus a matching hand-drawn histogram
Score awarded: 100%
Reason: Correct bin boundaries and frequency fractions in the table. The hand-drawn bar chart matched the table. Grade from the table; the visual is a secondary check.

--- EXAMPLE 6: Histogram with wrong y-axis label but correct shape and bins → FULL CREDIT ---
Question: Problem 4 (a) and (b) - construct histograms
Correct answer: y-axis should show fraction of observations (e.g. 0.11, 0.44, 0.33, 0.11)
Student answer: y-axis labeled "occurrences" showing raw counts (1, 4, 3, 1) instead of fractions - bin boundaries and bar heights otherwise correct
Score awarded: 100%
Reason: The bin boundaries and relative bar heights were correct. Labeling the y-axis as counts vs. fractions is a minor presentation issue, not a conceptual error. Full credit.

--- EXAMPLE 7: Sample space given as range instead of enumerated set → 75% CREDIT ---
Question: Ang and Tang 2.1 (c) - sample space of T (travel time) and C (cost) from A to C as pairs
Correct answer: {(8,1500), (9,1500), (10,1500), (11,850), (12,850), (13,850), (14,850)}
Student wrote: "Sample space of T is 8h ≤ T ≤ 14h; Sample space of C is $850 ≤ C ≤ $1500"
Score awarded: 75%
Reason: Student identified the correct ranges but failed to enumerate the joint sample space as specific ordered pairs. The form of the answer was wrong - a continuous range instead of a discrete set. 25% deduction.

PARTIAL CREDIT CONVENTION FOR THIS COURSE:
- 1 significant error in a multi-element answer → 75%
- 2+ significant errors → 50% or below depending on severity
- Minor rounding (within ±0.01) or notation differences → never deduct
- Minor axis label errors (e.g. "occurrences" vs "fraction") → never deduct if values/shape are correct
- Missing intermediate steps but correct final answer → full credit
- Correct method, wrong arithmetic → typically 75%
- Wrong form of answer (e.g. range instead of enumerated set) → 75%
"""

GRADING_SYSTEM_PROMPT = f"""You are a statistics TA grading a student's handwritten assignment for CAEE 361 (Statistical Analysis of Engineering Systems).

You will receive the correct answer/rubric for ONE question and the student's extracted answer.

Core rules:
- Mathematical expressions are equivalent regardless of order: a+b = b+a, x_bar = mean = average.
- Accept equivalent notation: x̄, x_bar, sample mean, "the mean" are all the same thing.
- Rounding within ±0.01 of the correct answer always gets full credit.
- For explanation questions: award full credit if the student captures the core statistical concept, even with imprecise wording.
- For set/table questions: check that key values are present and correct.
- For diagram questions with an accompanying frequency table: grade primarily from the table.
- The standard partial credit deduction is 25% per significant error within a sub-part.

{FEW_SHOT_EXAMPLES}

Respond ONLY with valid JSON:
{{
  "score": <float between 0 and max_score>,
  "explanation": "<1-3 sentences a student would understand. Be specific about what was right and what was wrong.>",
  "confidence": <float 0.0-1.0 reflecting how confident you are given OCR legibility>
}}"""


def _build_grading_prompt(rubric_item: dict, ocr_result: dict) -> str:
    sub = f" ({rubric_item.get('sub_part')})" if rubric_item.get("sub_part") else ""
    key_vals = rubric_item.get("key_values", [])
    key_val_hint = f"\nKey numerical values expected: {key_vals}" if key_vals else ""
    answer_type = rubric_item.get("answer_type", "mixed")

    return f"""Question: {rubric_item['problem_label']}{sub}
Max score: {rubric_item['max_score']} pts
Answer type: {answer_type}{key_val_hint}

CORRECT ANSWER:
{rubric_item['correct_answer']}

STUDENT'S EXTRACTED ANSWER:
{ocr_result.get('text', '(no text extracted)')}
{f"Equations/LaTeX: {ocr_result.get('latex', '')}" if ocr_result.get('latex') else ""}

Grade this answer. Max score is {rubric_item['max_score']} pts."""


def _build_diagram_prompt(rubric_item: dict, ocr_result: dict) -> str:
    """Prompt for diagram questions - Claude Vision already saw the image during OCR.
    We grade based on what was extracted plus the low-confidence flag."""
    sub = f" ({rubric_item.get('sub_part')})" if rubric_item.get("sub_part") else ""
    return f"""Question: {rubric_item['problem_label']}{sub} [DIAGRAM ANSWER]
Max score: {rubric_item['max_score']} pts

CORRECT ANSWER:
{rubric_item['correct_answer']}

WHAT THE STUDENT DREW (extracted from diagram):
{ocr_result.get('text', '(diagram only - no text extracted)')}

This is a diagram/sketch question. Grade based on the extracted description of what the student drew.
If the extraction says "(diagram)" with no detail, set confidence=0.3 to flag for TA review.
Apply the 25%-per-error partial credit convention. Max score is {rubric_item['max_score']} pts."""


async def grade_question(ocr_result: dict, rubric_item: dict, use_escalation: bool = False) -> GradingResult:
    question_key = rubric_item["question_key"]
    max_score = float(rubric_item.get("max_score", 0))
    ocr_confidence = float(ocr_result.get("confidence", 1.0))
    is_diagram = rubric_item.get("answer_type") == "diagram"
    is_gradeable = rubric_item.get("gradeable", True)

    # Truly ungradeble (marked manually ungradeble in rubric)
    if not is_gradeable:
        return GradingResult(
            question_key=question_key,
            problem_label=rubric_item.get("problem_label", question_key),
            sub_part=rubric_item.get("sub_part"),
            extracted_text=ocr_result.get("text", ""),
            score=0.0,
            max_score=max_score,
            explanation="Requires manual grading - enter score above.",
            confidence=1.0,
            flagged=True,
            manually_graded=True
        )

    # Fast path: symbolic math equivalence (free, no LLM call needed)
    extracted_latex = ocr_result.get("latex", "")
    if extracted_latex and rubric_item.get("answer_type") in ("numerical", "mixed"):
        correct_answer = rubric_item.get("correct_answer", "")
        if are_mathematically_equivalent(extracted_latex, correct_answer):
            return GradingResult(
                question_key=question_key,
                problem_label=rubric_item.get("problem_label", question_key),
                sub_part=rubric_item.get("sub_part"),
                extracted_text=ocr_result.get("text", ""),
                score=max_score,
                max_score=max_score,
                explanation="Correct - mathematically equivalent to the solution.",
                confidence=ocr_confidence,
                flagged=ocr_confidence < settings.confidence_threshold
            )

    # LLM grading - use diagram prompt for diagram-type answers
    # Diagrams always escalate to Sonnet for better spatial reasoning
    if is_diagram:
        model = settings.escalation_model
        prompt = _build_diagram_prompt(rubric_item, ocr_result)
    else:
        model = settings.escalation_model if use_escalation else settings.grading_model
        prompt = _build_grading_prompt(rubric_item, ocr_result)

    # Prompt caching: the system prompt (with 7 few-shot examples) is identical for every
    # grading call. Marking it as cache_control: ephemeral lets the API serve it from cache
    # on subsequent reads at 10% of normal input cost (5-min TTL, refreshes on each hit).
    response = client.messages.create(
        model=model,
        max_tokens=512,
        system=[
            {
                "type": "text",
                "text": GRADING_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": prompt}]
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    try:
        result = json.loads(raw)
        score = max(0.0, min(float(result["score"]), max_score))
        grading_conf = float(result.get("confidence", 1.0))
        combined_conf = min(ocr_confidence, grading_conf)

        # Diagrams always get flagged for TA spot-check regardless of confidence
        flagged = is_diagram or combined_conf < settings.confidence_threshold

        return GradingResult(
            question_key=question_key,
            problem_label=rubric_item.get("problem_label", question_key),
            sub_part=rubric_item.get("sub_part"),
            extracted_text=ocr_result.get("text", ""),
            score=score,
            max_score=max_score,
            explanation=result["explanation"],
            confidence=combined_conf,
            flagged=flagged,
            manually_graded=is_diagram
        )
    except (json.JSONDecodeError, KeyError):
        return GradingResult(
            question_key=question_key,
            problem_label=rubric_item.get("problem_label", question_key),
            sub_part=rubric_item.get("sub_part"),
            extracted_text=ocr_result.get("text", ""),
            score=0.0,
            max_score=max_score,
            explanation="Grading failed - manual review required.",
            confidence=0.0,
            flagged=True
        )


def _merge_duplicate_ocr(ocr_results: list[dict]) -> list[dict]:
    """
    Safety net: if the OCR returns multiple entries with the same question_key
    (e.g. when a student's work for one problem spans multiple visual sections),
    merge them into a single entry. Without this, the same question gets graded
    multiple times and shows up duplicated in the breakdown UI.
    """
    merged: dict[str, dict] = {}
    for r in ocr_results:
        key = str(r.get("question_key", r.get("question_number", ""))).strip()
        if not key:
            continue
        if key not in merged:
            merged[key] = {
                "question_key": key,
                "text": r.get("text", ""),
                "latex": r.get("latex", ""),
                "confidence": float(r.get("confidence", 1.0)),
            }
        else:
            # Concatenate text and latex, take the lowest confidence
            existing = merged[key]
            existing["text"] = "\n".join(filter(None, [existing["text"], r.get("text", "")])).strip()
            existing["latex"] = " ".join(filter(None, [existing["latex"], r.get("latex", "")])).strip()
            existing["confidence"] = min(existing["confidence"], float(r.get("confidence", 1.0)))
    return list(merged.values())


async def grade_submission(
    ocr_results: list[dict],
    rubric: list[dict],
    on_question_start=None,    # async (question_key, problem_label) → None
) -> list[GradingResult]:
    """
    Grade each OCR-extracted answer against the rubric. Optionally calls
    on_question_start(key, label) before each question so callers can update
    a live progress field in the DB.
    """
    rubric_map = {item["question_key"]: item for item in rubric}
    graded = []

    # Collapse duplicates before grading - never grade the same key twice
    ocr_results = _merge_duplicate_ocr(ocr_results)

    for ocr_result in ocr_results:
        q_key = str(ocr_result.get("question_key", ocr_result.get("question_number", "")))
        if q_key not in rubric_map:
            continue

        rubric_item = rubric_map[q_key]
        ocr_conf = float(ocr_result.get("confidence", 1.0))
        use_escalation = ocr_conf < settings.confidence_threshold

        if on_question_start:
            sub = rubric_item.get("sub_part")
            display = rubric_item.get("problem_label", q_key)
            if sub:
                display = f"{display} ({sub})"
            await on_question_start(q_key, display)

        result = await grade_question(ocr_result, rubric_item, use_escalation)
        graded.append(result)

    return graded
