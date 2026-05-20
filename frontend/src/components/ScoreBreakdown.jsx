import { useState, useEffect } from 'react'

export default function ScoreBreakdown({ questionGrades, rubricMap = {}, onOverride, onFeedback }) {
  if (!questionGrades?.length) {
    return <p className="text-gray-400 text-sm">No question data available.</p>
  }
  return (
    <div className="flex flex-col gap-4">
      {questionGrades.map((q) => (
        <QuestionRow
          key={q.id}
          grade={q}
          rubricItem={rubricMap[q.question_key]}
          onOverride={onOverride}
          onFeedback={onFeedback}
        />
      ))}
    </div>
  )
}

function QuestionRow({ grade, rubricItem, onOverride, onFeedback }) {
  const {
    question_key, problem_label, sub_part, score, max_score,
    explanation, confidence, flagged, manually_graded, ta_feedback
  } = grade

  const displayLabel = problem_label || question_key
  const subLabel = sub_part ? ` (${sub_part})` : ''

  return (
    <div className={`rounded-xl border p-4 ${flagged ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-gray-800">{displayLabel}{subLabel}</span>
        <div className="flex items-center gap-3">
          {flagged && (
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Needs Review</span>
          )}
          <span className="text-lg font-bold text-blue-700">
            {score} <span className="text-sm font-normal text-gray-400">/ {max_score}</span>
          </span>
        </div>
      </div>

      {rubricItem && (
        <div className="mb-3">
          <p className="text-xs font-medium text-gray-500 mb-1">Expected answer</p>
          <ExpectedAnswer rubricItem={rubricItem} />
        </div>
      )}

      <div className="mb-3">
        <p className="text-xs font-medium text-gray-500 mb-1">Grader explanation</p>
        <p className="text-sm text-gray-700">{explanation}</p>
      </div>

      {confidence !== null && confidence !== undefined && (
        <p className="text-xs text-gray-400">OCR confidence: {Math.round(confidence * 100)}%</p>
      )}

      {manually_graded && (
        <p className="text-xs text-red-600 mt-2 bg-red-50 rounded px-2 py-1">
          Diagram answer — enter the score manually below after reviewing the student's paper.
        </p>
      )}

      {/* Score input + TA feedback — both directly editable, no confirmation */}
      <div className="mt-3 pt-3 border-t border-gray-200 flex flex-col gap-2">
        {onOverride && (
          <ScoreInput
            current={score}
            max={max_score}
            onSave={(newScore) => onOverride(question_key, newScore)}
          />
        )}
        {onFeedback && (
          <FeedbackInput
            current={ta_feedback || ''}
            onSave={(text) => onFeedback(question_key, text)}
          />
        )}
      </div>
    </div>
  )
}

function ExpectedAnswer({ rubricItem }) {
  const { correct_answer, key_values } = rubricItem
  const lines = formatAnswerLines(correct_answer)
  return (
    <div className="bg-blue-50 border border-blue-100 rounded p-2 text-sm text-gray-700">
      {key_values?.length > 0 && (
        <p className="font-mono text-blue-700 font-semibold mb-2 text-xs">
          Key values: {key_values.join(', ')}
        </p>
      )}
      <div className="font-mono text-xs space-y-1">
        {lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  )
}

function formatAnswerLines(text) {
  if (!text) return []

  // Step 1: normalize sentence-ending punctuation to newlines.
  // \s already covers normal space, non-breaking space, tab, existing newlines.
  let lines = text
    .replace(/([.;])\s+(?=\S)/g, '$1\n')
    .split(/\n+/)
    .map(s => s.trim())
    .filter(Boolean)

  // Step 2: defensive fallback — if any line is still very long AND clearly
  // contains multiple equations (period + space + letter), split it again.
  // This catches edge cases where the data has unusual whitespace characters.
  lines = lines.flatMap(line => {
    if (line.length <= 100) return [line]
    const parts = line.split(/(?<=\.)\s+(?=[A-Za-z])/)
    return parts.length > 1 ? parts.map(p => p.trim()).filter(Boolean) : [line]
  })

  return lines
}

/**
 * Direct-overwrite score input. Saves on blur or Enter. No confirmation —
 * routine corrections shouldn't have friction.
 */
function ScoreInput({ current, max, onSave }) {
  const [value, setValue] = useState(current)

  // Keep local state in sync if the prop changes (e.g. after a server-side update)
  useEffect(() => { setValue(current) }, [current])

  const commit = () => {
    const val = parseFloat(value)
    if (isNaN(val) || val < 0 || val > max) {
      setValue(current)   // reset to last good value
      return
    }
    if (val !== current) onSave(val)
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-500">Score:</label>
      <input
        type="number"
        step="0.5"
        min={0}
        max={max}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        className="w-20 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      <span className="text-xs text-gray-400">/ {max}</span>
    </div>
  )
}

/**
 * Per-question TA feedback textarea. Saves on blur (or Cmd/Ctrl+Enter).
 * Auto-grows up to 4 lines.
 */
function FeedbackInput({ current, onSave }) {
  const [value, setValue] = useState(current)

  useEffect(() => { setValue(current) }, [current])

  const commit = () => {
    if (value !== current) onSave(value)
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500">Your feedback (optional)</label>
      <textarea
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.currentTarget.blur()
          }
        }}
        placeholder="Add a comment for this question — saved automatically"
        className="border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y bg-gray-50"
      />
    </div>
  )
}
