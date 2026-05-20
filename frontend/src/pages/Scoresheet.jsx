import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'

const API = 'http://localhost:8000'

/**
 * Clean, print-friendly view of a finalized submission.
 * Use the browser's print dialog (⌘P / Ctrl+P) to save as PDF.
 *
 * Hides navigation, sidebar, etc. via @media print rules in index.css.
 */
export default function Scoresheet() {
  const { submissionId } = useParams()
  const [submission, setSubmission] = useState(null)
  const [assignment, setAssignment] = useState(null)
  const [rubricMap, setRubricMap] = useState({})

  useEffect(() => {
    fetch(`${API}/grades/submission/${submissionId}`)
      .then(r => r.json())
      .then(async (sub) => {
        setSubmission(sub)
        const aRes = await fetch(`${API}/assignments/${sub.assignment_id}`)
        const a = await aRes.json()
        setAssignment(a)
        const map = {}
        for (const item of (a.rubric || [])) map[item.question_key] = item
        setRubricMap(map)
      })
  }, [submissionId])

  if (!submission || !assignment) return <p className="text-gray-400 text-sm">Loading…</p>

  const { student_name, student_id, total_score, max_score, finalized, finalized_at, question_grades, graded_at } = submission
  const pct = max_score ? Math.round((total_score / max_score) * 100) : null
  const avgPerQuestion = question_grades.length
    ? Math.round(question_grades.reduce((s, q) => s + (q.score || 0), 0) / question_grades.length)
    : 0

  return (
    <div className="max-w-3xl mx-auto bg-white">
      {/* Top action bar — hidden when printing */}
      <div className="print:hidden flex items-center justify-between mb-6 gap-3">
        <Link to={`/results/${submissionId}`} className="text-sm text-blue-500 hover:underline">
          ← Back to Results
        </Link>
        <div className="flex items-center gap-3">
          {!finalized && (
            <FinalizeButton submissionId={submissionId} onFinalized={() => window.location.reload()} />
          )}
          <button
            onClick={() => window.print()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Print / Save as PDF
          </button>
        </div>
      </div>

      {/* The scoresheet itself */}
      <div className="border border-gray-200 rounded-xl p-8 print:border-0 print:p-0">
        {/* Header */}
        <div className="border-b border-gray-300 pb-4 mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{assignment.name}</h1>
            <p className="text-sm text-gray-600 mt-1">
              Scoresheet for <strong>{student_name}</strong>
              {student_id && <span className="ml-2 font-mono text-gray-500">(ID: {student_id})</span>}
            </p>
            {graded_at && (
              <p className="text-xs text-gray-400 mt-1">Graded {new Date(graded_at).toLocaleDateString()}</p>
            )}
            {finalized && finalized_at && (
              <p className="text-xs text-green-700 mt-1">
                Finalized {new Date(finalized_at).toLocaleString()}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-blue-700">{total_score} <span className="text-base font-normal text-gray-400">/ {max_score}</span></p>
            {pct !== null && <p className="text-sm text-gray-500">{pct}% &middot; avg {avgPerQuestion}/100 per question</p>}
          </div>
        </div>

        {/* Per-question scoresheet */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500 text-xs uppercase">
              <th className="text-left py-2 w-32">Question</th>
              <th className="text-left py-2">Feedback &amp; Explanation</th>
              <th className="text-right py-2 w-20">Score</th>
            </tr>
          </thead>
          <tbody>
            {question_grades.map(q => (
              <ScoreRow key={q.id} grade={q} rubricItem={rubricMap[q.question_key]} />
            ))}
          </tbody>
        </table>

        {/* Footer / total */}
        <div className="border-t border-gray-300 pt-3 mt-3 flex justify-between items-center">
          <p className="text-sm text-gray-500">Total ({question_grades.length} questions)</p>
          <p className="text-xl font-bold text-blue-700">
            {total_score} <span className="text-sm font-normal text-gray-400">/ {max_score}</span>
          </p>
        </div>
      </div>
    </div>
  )
}

function ScoreRow({ grade, rubricItem }) {
  const { problem_label, sub_part, question_key, score, max_score, explanation, ta_feedback } = grade
  const label = (problem_label || question_key) + (sub_part ? ` (${sub_part})` : '')
  const pct = max_score ? Math.round((score / max_score) * 100) : 0

  return (
    <tr className="border-b border-gray-100 align-top">
      <td className="py-3 font-semibold text-gray-800">{label}</td>
      <td className="py-3 text-sm text-gray-700">
        {ta_feedback && (
          <p className="mb-1"><strong className="text-gray-600">TA feedback:</strong> {ta_feedback}</p>
        )}
        <p className="text-gray-500">{explanation}</p>
      </td>
      <td className="py-3 text-right">
        <p className="font-bold text-blue-700">{score}</p>
        <p className="text-xs text-gray-400">{pct}%</p>
      </td>
    </tr>
  )
}

function FinalizeButton({ submissionId, onFinalized }) {
  const [busy, setBusy] = useState(false)
  const handle = async () => {
    if (!window.confirm('Finalize this submission? You can unfinalize later if needed.')) return
    setBusy(true)
    await fetch(`${API}/grades/submission/${submissionId}/finalize`, { method: 'POST' })
    setBusy(false)
    onFinalized()
  }
  return (
    <button
      onClick={handle}
      disabled={busy}
      className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
    >
      {busy ? 'Finalizing…' : 'Finalize'}
    </button>
  )
}
