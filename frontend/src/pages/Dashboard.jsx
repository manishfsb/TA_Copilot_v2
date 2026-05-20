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

  const fetchSubmissions = (assignmentId) => {
    fetch(`${API}/grades/assignment/${assignmentId}`)
      .then((r) => r.json())
      .then(setSubmissions)
  }

  useEffect(() => {
    if (!selected) return
    fetchSubmissions(selected)
  }, [selected])

  const hasActive = submissions.some(s => s.status === 'pending' || s.status === 'grading')
  useEffect(() => {
    if (!selected || !hasActive) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      return
    }
    intervalRef.current = setInterval(() => fetchSubmissions(selected), POLL_INTERVAL_MS)
    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null } }
  }, [selected, hasActive])

  const flagged = submissions.filter((s) => s.flagged && !s.finalized)
  const done    = submissions.filter((s) => !s.flagged && s.status === 'done')
  const finalized = submissions.filter((s) => s.finalized)
  const pending = submissions.filter((s) => s.status === 'pending' || s.status === 'grading')
  const currentlyGrading = pending.find(s => s.status === 'grading')

  // Derived stats for the summary header
  const gradedCount  = submissions.filter(s => s.status === 'done' || s.status === 'flagged').length
  const totalCount   = submissions.length
  const scoredSubs   = submissions.filter(s => s.total_score != null && s.max_score > 0)
  const avgPct       = scoredSubs.length
    ? Math.round(scoredSubs.reduce((sum, s) => sum + (s.total_score / s.max_score) * 100, 0) / scoredSubs.length)
    : null

  // Score distribution: 10 bins of 10 pts each (0–9%, 10–19%, …, 90–100%)
  const BIN_COUNT = 10
  const binCounts = Array(BIN_COUNT).fill(0)
  scoredSubs.forEach(s => {
    const pct = (s.total_score / s.max_score) * 100
    const bin = Math.min(Math.floor(pct / 10), BIN_COUNT - 1)
    binCounts[bin]++
  })
  const maxBinCount = Math.max(...binCounts, 1)

  const selectedAssignment = assignments.find(a => a.id === selected)

  if (loading) return <StatsLoader title="Loading dashboard" />

  return (
    <div className="flex flex-col gap-6">

      {/* ── Assignment tabs + upload button ── */}
      {assignments.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          {assignments.map((a) => {
            const subs = a.submissions ?? []
            const needsReview = subs.filter(s => s.flagged && !s.finalized).length
            const isActive = selected === a.id
            return (
              <button
                key={a.id}
                onClick={() => setSelected(a.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400'
                }`}
              >
                {a.name}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  isActive ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {subs.length}
                </span>
                {needsReview > 0 && (
                  <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" title={`${needsReview} need review`} />
                )}
              </button>
            )
          })}
          <div className="ml-auto flex items-center gap-3">
            {selected && (
              <Link
                to={`/assignments/${selected}/edit-rubric`}
                className="text-xs text-gray-400 hover:text-blue-600 hover:underline"
              >
                Edit rubric
              </Link>
            )}
            <Link
              to="/upload"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              + Upload
            </Link>
          </div>
        </div>
      )}

      {/* ── No assignments yet ── */}
      {assignments.length === 0 && (
        <div className="text-center py-24 text-gray-400 flex flex-col items-center gap-3">
          <div className="text-5xl">📋</div>
          <p className="text-lg font-medium text-gray-500">No assignments yet</p>
          <p className="text-sm">Upload a solution set to get started.</p>
          <Link to="/upload" className="mt-2 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            Create first assignment →
          </Link>
        </div>
      )}


      {/* ── Assignment summary header ── */}
      {selectedAssignment && totalCount > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Left: name, progress, stats */}
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selectedAssignment.name}</h2>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {gradedCount} of {totalCount} graded
                    {pending.length > 0 && ` · ${pending.length} in queue`}
                  </p>
                </div>
                {avgPct !== null && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-3xl font-bold text-blue-700">{avgPct}%</p>
                    <p className="text-xs text-gray-400 mt-0.5">class avg</p>
                  </div>
                )}
              </div>

              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Grading progress</span>
                  <span>{Math.round((gradedCount / totalCount) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(gradedCount / totalCount) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Right: score distribution bar chart */}
            {scoredSubs.length > 0 && (
              <ScoreChart binCounts={binCounts} maxBinCount={maxBinCount} total={scoredSubs.length} />
            )}
          </div>
        </div>
      )}

      {/* ── Live grading progress banner ── */}
      {hasActive && (
        <GradingProgress
          submissions={submissions}
          currentlyGrading={currentlyGrading}
        />
      )}

      {/* ── Compact stat row ── */}
      {submissions.length > 0 && (
        <div className="flex gap-2 text-sm">
          <StatChip label="Needs Review" value={flagged.length} color="red" />
          <StatChip label="Graded" value={done.length} color="green" />
          <StatChip label="Finalized" value={finalized.length} color="blue" />
          <StatChip label="Pending" value={pending.length} color="gray" />
        </div>
      )}

      {/* ── Flagged section ── */}
      {flagged.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            Needs Manual Review ({flagged.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {flagged.map((s) => <PaperCard key={s.id} submission={s} />)}
          </div>
        </section>
      )}

      {/* ── Done section ── */}
      {done.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Graded ({done.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {done.map((s) => <PaperCard key={s.id} submission={s} />)}
          </div>
        </section>
      )}

      {/* ── Finalized section ── */}
      {finalized.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
            Finalized ({finalized.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {finalized.map((s) => <PaperCard key={s.id} submission={s} />)}
          </div>
        </section>
      )}

      {/* ── Pending section ── */}
      {pending.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">In Progress ({pending.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pending.map((s) => <PaperCard key={s.id} submission={s} />)}
          </div>
        </section>
      )}

      {/* ── Empty state (assignment exists but no submissions yet) ── */}
      {selectedAssignment && totalCount === 0 && !loading && (
        <div className="text-center py-20 flex flex-col items-center gap-3 text-gray-400">
          <div className="text-5xl">📄</div>
          <p className="text-base font-medium text-gray-500">No submissions yet for {selectedAssignment.name}</p>
          <p className="text-sm">Drop student papers to start grading.</p>
          <Link to="/upload" className="mt-2 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            Upload papers →
          </Link>
        </div>
      )}
    </div>
  )
}

function GradingProgress({ submissions, currentlyGrading }) {
  const total    = submissions.length
  const finished = submissions.filter(s => s.status === 'done' || s.status === 'flagged').length
  const pct      = total > 0 ? Math.round((finished / total) * 100) : 0

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
  return <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
}

function ScoreChart({ binCounts, maxBinCount, total }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-400">Score distribution ({total} graded)</p>
      <div className="flex items-end gap-1 h-24">
        {binCounts.map((count, i) => {
          const pct = i * 10
          const barColor = pct >= 70 ? 'bg-green-400' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400'
          const heightPct = (count / maxBinCount) * 100
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
              {/* Tooltip */}
              {count > 0 && (
                <div className="absolute bottom-full mb-1 hidden group-hover:flex bg-gray-800 text-white text-xs rounded px-1.5 py-0.5 whitespace-nowrap z-10">
                  {count} student{count !== 1 ? 's' : ''} · {pct}–{pct + 9}%
                </div>
              )}
              <div
                className={`w-full rounded-t transition-all duration-500 ${count > 0 ? barColor : 'bg-gray-100'}`}
                style={{ height: `${Math.max(heightPct, count > 0 ? 6 : 2)}%` }}
              />
            </div>
          )
        })}
      </div>
      {/* X-axis labels */}
      <div className="flex justify-between text-xs text-gray-300 px-0.5">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  )
}

function StatChip({ label, value, color }) {
  const colors = {
    red:   'bg-red-50 text-red-700 border-red-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    blue:  'bg-blue-50 text-blue-700 border-blue-200',
    gray:  'bg-gray-50 text-gray-600 border-gray-200',
  }
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${colors[color]}`}>
      <span className="font-bold text-sm">{value}</span>
      <span>{label}</span>
    </div>
  )
}
