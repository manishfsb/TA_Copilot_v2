import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import ScoreBreakdown from '../components/ScoreBreakdown'
import PaperViewer from '../components/PaperViewer'
import StatsLoader from '../components/StatsLoader'

const API = 'http://localhost:8000'
const POLL_INTERVAL_MS = 2500

export default function Results() {
  const { submissionId } = useParams()
  const [submission, setSubmission] = useState(null)
  const [rubricMap, setRubricMap] = useState({})    // question_key → rubric item
  const [loading, setLoading] = useState(true)
  const [overrideMsg, setOverrideMsg] = useState('')
  const intervalRef = useRef(null)

  const fetchSubmission = () => {
    fetch(`${API}/grades/submission/${submissionId}`)
      .then((r) => r.json())
      .then(async (sub) => {
        setSubmission(sub)
        const aRes = await fetch(`${API}/assignments/${sub.assignment_id}`)
        const assignment = await aRes.json()
        const map = {}
        for (const item of (assignment.rubric || [])) {
          map[item.question_key] = item
        }
        setRubricMap(map)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchSubmission() }, [submissionId])

  // Auto-poll while grading is still in progress
  const stillGrading = submission && (submission.status === 'pending' || submission.status === 'grading')
  useEffect(() => {
    if (!stillGrading) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
      return
    }
    intervalRef.current = setInterval(fetchSubmission, POLL_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [stillGrading, submissionId])

  const handleOverride = async (questionKey, newScore) => {
    const res = await fetch(
      `${API}/grades/submission/${submissionId}/override?question_key=${encodeURIComponent(questionKey)}&new_score=${newScore}`,
      { method: 'PATCH' }
    )
    if (res.ok) {
      setOverrideMsg('Score updated.')
      fetchSubmission()
      setTimeout(() => setOverrideMsg(''), 2000)
    }
  }

  const handleFeedback = async (questionKey, feedback) => {
    await fetch(
      `${API}/grades/submission/${submissionId}/feedback?question_key=${encodeURIComponent(questionKey)}&feedback=${encodeURIComponent(feedback)}`,
      { method: 'PATCH' }
    )
    // Quiet save — no toast. The textarea blur is the user's confirmation.
  }

  if (loading) return <StatsLoader title="Loading paper" />
  if (!submission) return <p className="text-red-500 text-sm">Submission not found.</p>

  const {
    student_name, student_id, total_score, max_score, flagged, flag_reason,
    question_grades, graded_at, assignment_id, finalized, finalized_at, status,
    current_question_label
  } = submission

  // Active grading state — show the animated loader with live progress
  if (status === 'pending' || status === 'grading') {
    const subtitle = current_question_label
      ? `Grading ${current_question_label}`
      : status === 'pending'
        ? `${student_name} — queued, waiting for an earlier paper to finish`
        : `${student_name} — extracting handwriting`
    return (
      <div className="flex flex-col gap-4">
        <Link to="/" className="text-sm text-blue-500 hover:underline">← Back to dashboard</Link>
        <StatsLoader
          title={`Grading ${student_name}`}
          subtitle={subtitle}
        />
      </div>
    )
  }
  const pct = max_score ? Math.round((total_score / max_score) * 100) : null

  const handleRegrade = async () => {
    if (!window.confirm('Re-grade this submission against the current rubric? Existing scores will be replaced.')) return
    const res = await fetch(`${API}/grades/submission/${submissionId}/regrade`, { method: 'POST' })
    if (res.ok) {
      setOverrideMsg('Re-grade queued. Refresh in a minute.')
      setTimeout(fetchSubmission, 2000)
    } else {
      const data = await res.json()
      alert(data.detail || 'Re-grade failed')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top action bar */}
      <div className="flex items-center justify-between gap-2">
        <Link to="/" className="text-sm text-blue-500 hover:underline">← Back to dashboard</Link>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRegrade}
            disabled={finalized || status === 'grading'}
            className="text-sm border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            title={finalized ? 'Unfinalize first to re-grade' : 'Re-grade against current rubric'}
          >
            Re-grade
          </button>
          <Link
            to={`/scoresheet/${submissionId}`}
            className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700"
          >
            {finalized ? 'View scoresheet' : 'Finalize / Scoresheet'}
          </Link>
        </div>
      </div>

      {/* Two-column layout: breakdown left, paper viewer right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left: header + breakdown */}
        <div className="flex flex-col gap-4 min-w-0">
          {/* Header */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-gray-900 truncate">{student_name}</h1>
                {student_id && (
                  <p className="text-xs font-mono text-gray-500 mt-0.5">ID: {student_id}</p>
                )}
                {graded_at && (
                  <p className="text-xs text-gray-400 mt-1">
                    Graded {new Date(graded_at).toLocaleString()}
                  </p>
                )}
              </div>
              {pct !== null && (
                <div className="text-right flex-shrink-0">
                  <p className="text-3xl font-bold text-blue-700">{total_score}</p>
                  <p className="text-sm text-gray-400">/ {max_score} pts ({pct}%)</p>
                </div>
              )}
            </div>

            {flagged && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                <span className="font-semibold">Flagged for review:</span> {flag_reason}
              </div>
            )}
          </div>

          {overrideMsg && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-3 py-2 rounded-lg">
              {overrideMsg}
            </div>
          )}

          {/* Question breakdown */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Question Breakdown</h2>
            <ScoreBreakdown
              questionGrades={question_grades}
              rubricMap={rubricMap}
              onOverride={handleOverride}
              onFeedback={handleFeedback}
            />
          </div>
        </div>

        {/* Right: paper viewer (sticky) */}
        <div className="min-w-0">
          <PaperViewer
            submissionId={submissionId}
            assignmentId={assignment_id}
          />
        </div>
      </div>
    </div>
  )
}
