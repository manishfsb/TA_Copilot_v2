import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import PaperCard from '../components/PaperCard'
import StatsLoader from '../components/StatsLoader'

const API = 'http://localhost:8000'
const POLL_INTERVAL_MS = 3000

export default function Dashboard() {
  const [assignments, setAssignments] = useState([])
  const [selected, setSelected] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef(null)

  useEffect(() => {
    fetch(`${API}/assignments/`)
      .then((r) => r.json())
      .then((data) => {
        setAssignments(data)
        if (data.length) setSelected(data[0].id)
      })
      .finally(() => setLoading(false))
  }, [])

  // Fetch submissions for the selected assignment. Memoized as a stable ref
  // so the polling effect below can call it without re-running on every render.
  const fetchSubmissions = (assignmentId) => {
    fetch(`${API}/grades/assignment/${assignmentId}`)
      .then((r) => r.json())
      .then(setSubmissions)
  }

  // Initial fetch when assignment changes
  useEffect(() => {
    if (!selected) return
    fetchSubmissions(selected)
  }, [selected])

  // Auto-poll while there are pending or grading submissions
  const hasActive = submissions.some(s => s.status === 'pending' || s.status === 'grading')
  useEffect(() => {
    if (!selected || !hasActive) {
      // No active jobs → stop polling
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }
    // Start polling
    intervalRef.current = setInterval(() => fetchSubmissions(selected), POLL_INTERVAL_MS)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [selected, hasActive])

  const flagged = submissions.filter((s) => s.flagged)
  const done = submissions.filter((s) => !s.flagged && s.status === 'done')
  const pending = submissions.filter((s) => s.status === 'pending' || s.status === 'grading')
  const currentlyGrading = pending.find(s => s.status === 'grading')

  if (loading) return <StatsLoader title="Loading dashboard" />

  return (
    <div className="flex flex-col gap-8">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">{submissions.length} submissions</p>
        </div>
        <Link
          to="/upload"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Upload submissions
        </Link>
      </div>

      {/* Live progress bar — only while there are active jobs */}
      {hasActive && (
        <GradingProgress
          submissions={submissions}
          currentlyGrading={currentlyGrading}
        />
      )}

      {/* Assignment selector */}
      {assignments.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {assignments.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelected(a.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                selected === a.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400'
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}

      {assignments.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No assignments yet.</p>
          <Link to="/upload" className="text-blue-500 hover:underline text-sm mt-2 inline-block">
            Create your first assignment →
          </Link>
        </div>
      )}

      {/* Per-assignment actions */}
      {selected && (
        <div className="flex items-center justify-end gap-2 -mt-2">
          <Link
            to={`/assignments/${selected}/edit-rubric`}
            className="text-xs text-gray-500 hover:text-blue-600 hover:underline"
          >
            Edit rubric for this assignment
          </Link>
        </div>
      )}

      {/* Stats bar */}
      {submissions.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Needs Review" value={flagged.length} color="red" />
          <StatCard label="Graded" value={done.length} color="green" />
          <StatCard label="Pending" value={pending.length} color="gray" />
        </div>
      )}

      {/* Flagged section — always on top */}
      {flagged.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-red-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            Needs Manual Review ({flagged.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {flagged.map((s) => <PaperCard key={s.id} submission={s} />)}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Graded ({done.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {done.map((s) => <PaperCard key={s.id} submission={s} />)}
          </div>
        </section>
      )}

      {pending.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">In Progress ({pending.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pending.map((s) => <PaperCard key={s.id} submission={s} />)}
          </div>
        </section>
      )}
    </div>
  )
}

function GradingProgress({ submissions, currentlyGrading }) {
  const total = submissions.length
  const finished = submissions.filter(s => s.status === 'done' || s.status === 'flagged').length
  const pct = total > 0 ? Math.round((finished / total) * 100) : 0

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Spinner />
          <div>
            <p className="text-sm font-semibold text-blue-900">
              Grading in progress — {finished} of {total} complete
            </p>
            {currentlyGrading && (
              <p className="text-xs text-blue-700 mt-0.5">
                Currently: <span className="font-mono">{currentlyGrading.student_name}</span>
                {currentlyGrading.student_id && (
                  <span className="ml-1 text-blue-500">({currentlyGrading.student_id})</span>
                )}
              </p>
            )}
          </div>
        </div>
        <span className="text-sm font-bold text-blue-900">{pct}%</span>
      </div>

      <div className="w-full bg-blue-100 rounded-full h-2 overflow-hidden">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
  )
}

function StatCard({ label, value, color }) {
  const colors = {
    red:   'bg-red-50 border-red-200 text-red-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    gray:  'bg-gray-50 border-gray-200 text-gray-600',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm mt-1 font-medium">{label}</p>
    </div>
  )
}
