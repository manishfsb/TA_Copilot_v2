import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import PaperCard from '../components/PaperCard'
import StatsLoader from '../components/StatsLoader'
import SolutionSetEditor from '../components/SolutionSetEditor'

const API = 'http://localhost:8000'
const POLL_INTERVAL_MS = 3000

export default function Dashboard() {
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)

  // Finder-style navigation: one level visible at a time.
  // view: 'home' | 'solutions' | 'solution-detail' | 'papers' | 'paper-detail'
  const [view, setView] = useState('home')
  const [openAssignment, setOpenAssignment] = useState(null)  // open HW in 'paper-detail'
  const [openSolution, setOpenSolution] = useState(null)      // open solution in 'solution-detail'

  const [submissions, setSubmissions] = useState([])
  const intervalRef = useRef(null)

  useEffect(() => {
    fetch(`${API}/assignments/`)
      .then((r) => r.json())
      .then(setAssignments)
      .finally(() => setLoading(false))
  }, [])

  const fetchSubmissions = (assignmentId) => {
    fetch(`${API}/grades/assignment/${assignmentId}`)
      .then((r) => r.json())
      .then(setSubmissions)
  }

  // Load detailed submissions whenever a homework folder is opened.
  useEffect(() => {
    if (!openAssignment) { setSubmissions([]); return }
    fetchSubmissions(openAssignment)
  }, [openAssignment])

  const hasActive = submissions.some(s => s.status === 'pending' || s.status === 'grading')
  useEffect(() => {
    if (!openAssignment || !hasActive) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      return
    }
    intervalRef.current = setInterval(() => fetchSubmissions(openAssignment), POLL_INTERVAL_MS)
    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null } }
  }, [openAssignment, hasActive])

  // ── Navigation helpers ──
  const goHome      = () => { setView('home'); setOpenAssignment(null); setOpenSolution(null) }
  const goSolutions = () => { setView('solutions'); setOpenSolution(null) }
  const goPapers    = () => { setView('papers'); setOpenAssignment(null) }
  const openHW      = (id) => { setOpenAssignment(id); setView('paper-detail') }
  const openSolutionSet = (id) => { setOpenSolution(id); setView('solution-detail') }

  // Folder-level counts derived from the (nested) assignments list.
  const anyNeedsReview = assignments.some(a =>
    (a.submissions ?? []).some(s => s.flagged && !s.finalized)
  )

  if (loading) return <StatsLoader title="Loading dashboard" />

  // ── No assignments yet ──
  if (assignments.length === 0) {
    return (
      <div className="text-center py-24 text-gray-400 flex flex-col items-center gap-3">
        <div className="text-5xl">📋</div>
        <p className="text-lg font-medium text-gray-500">No assignments yet</p>
        <p className="text-sm">Upload a solution set to get started.</p>
        <Link to="/upload" className="mt-2 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          Create first assignment →
        </Link>
      </div>
    )
  }

  const selectedAssignment = assignments.find(a => a.id === openAssignment)
  const openSolutionAssignment = assignments.find(a => a.id === openSolution)

  return (
    <div className="flex flex-col gap-6">

      {/* ── Breadcrumb + upload button ── */}
      <div className="flex items-center justify-between gap-4">
        <Breadcrumb
          view={view}
          assignmentName={selectedAssignment?.name}
          solutionName={openSolutionAssignment?.name}
          onHome={goHome}
          onPapers={goPapers}
          onSolutions={goSolutions}
        />
        <Link
          to="/upload"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex-shrink-0"
        >
          + Upload
        </Link>
      </div>

      {/* ── Home: two top-level folders ── */}
      {view === 'home' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <FolderTile label="Solution Sets" count={assignments.length} onClick={goSolutions} />
          <FolderTile label="Student Papers" count={assignments.length} alert={anyNeedsReview} onClick={goPapers} />
        </div>
      )}

      {/* ── Solution Sets folder ── */}
      {view === 'solutions' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {assignments.map((a) => (
            <FolderTile key={a.id} label={a.name} icon="file" onClick={() => openSolutionSet(a.id)} />
          ))}
        </div>
      )}

      {/* ── Solution detail: rubric + PDF side by side ── */}
      {view === 'solution-detail' && openSolution && (
        <SolutionSetEditor assignmentId={openSolution} />
      )}

      {/* ── Student Papers folder: one subfolder per homework ── */}
      {view === 'papers' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {assignments.map((a) => {
            const subs = a.submissions ?? []
            const needsReview = subs.filter(s => s.flagged && !s.finalized).length
            return (
              <FolderTile
                key={a.id}
                label={a.name}
                count={subs.length}
                alert={needsReview > 0}
                alertTitle={needsReview > 0 ? `${needsReview} need review` : undefined}
                onClick={() => openHW(a.id)}
              />
            )
          })}
        </div>
      )}

      {/* ── Paper detail: a single homework's submissions ── */}
      {view === 'paper-detail' && selectedAssignment && (
        <PaperDetail
          assignment={selectedAssignment}
          submissions={submissions}
          hasActive={hasActive}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Paper detail view - the per-homework breakdown (formerly the whole dashboard)
// ─────────────────────────────────────────────────────────────────────────────
function PaperDetail({ assignment, submissions, hasActive }) {
  const flagged   = submissions.filter((s) => s.flagged && !s.finalized)
  const done      = submissions.filter((s) => !s.flagged && s.status === 'done')
  const finalized = submissions.filter((s) => s.finalized)
  const pending   = submissions.filter((s) => s.status === 'pending' || s.status === 'grading')
  const currentlyGrading = pending.find(s => s.status === 'grading')

  const gradedCount = submissions.filter(s => s.status === 'done' || s.status === 'flagged').length
  const totalCount  = submissions.length
  const scoredSubs  = submissions.filter(s => s.total_score != null && s.max_score > 0)
  const avgPct      = scoredSubs.length
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

  // Empty state (homework exists but no submissions yet)
  if (totalCount === 0) {
    return (
      <div className="text-center py-20 flex flex-col items-center gap-3 text-gray-400">
        <div className="text-5xl">📄</div>
        <p className="text-base font-medium text-gray-500">No submissions yet for {assignment.name}</p>
        <p className="text-sm">Drop student papers to start grading.</p>
        <Link to="/upload" className="mt-2 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          Upload papers →
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Summary header ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{assignment.name}</h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  {gradedCount} of {totalCount} graded
                  {pending.length > 0 && ` - ${pending.length} in queue`}
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

          {scoredSubs.length > 0 && (
            <ScoreChart binCounts={binCounts} maxBinCount={maxBinCount} total={scoredSubs.length} />
          )}
        </div>
      </div>

      {/* ── Live grading progress banner ── */}
      {hasActive && (
        <GradingProgress submissions={submissions} currentlyGrading={currentlyGrading} />
      )}

      {/* ── Compact stat row ── */}
      <div className="flex gap-2 text-sm">
        <StatChip label="Needs Review" value={flagged.length} color="red" />
        <StatChip label="Graded" value={done.length} color="green" />
        <StatChip label="Finalized" value={finalized.length} color="blue" />
        <StatChip label="Pending" value={pending.length} color="gray" />
      </div>

      {/* ── Needs review (always open) ── */}
      {flagged.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            Needs Manual Review ({flagged.length})
          </h2>
          <PaperGrid submissions={flagged} />
        </section>
      )}

      {/* ── Pending (always open) ── */}
      {pending.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">In Progress ({pending.length})</h2>
          <PaperGrid submissions={pending} />
        </section>
      )}

      {/* ── Graded (collapsible) ── */}
      {done.length > 0 && (
        <CollapsibleSection title="Graded" count={done.length} dotColor="bg-green-400">
          <PaperGrid submissions={done} />
        </CollapsibleSection>
      )}

      {/* ── Finalized (collapsible) ── */}
      {finalized.length > 0 && (
        <CollapsibleSection title="Finalized" count={finalized.length} dotColor="bg-blue-400">
          <PaperGrid submissions={finalized} />
        </CollapsibleSection>
      )}
    </div>
  )
}

function PaperGrid({ submissions }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {submissions.map((s) => <PaperCard key={s.id} submission={s} />)}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation + folder components
// ─────────────────────────────────────────────────────────────────────────────
function Breadcrumb({ view, assignmentName, solutionName, onHome, onPapers, onSolutions }) {
  const crumbClass = "text-sm font-medium text-blue-600 hover:underline"
  const currentClass = "text-sm font-semibold text-gray-900"
  const sep = <span className="text-gray-300">/</span>

  return (
    <nav className="flex items-center gap-2 flex-wrap min-w-0">
      {view === 'home'
        ? <span className={currentClass}>Home</span>
        : <button onClick={onHome} className={crumbClass}>Home</button>}

      {(view === 'solutions' || view === 'solution-detail') && (
        <>
          {sep}
          {view === 'solutions'
            ? <span className={currentClass}>Solution Sets</span>
            : <button onClick={onSolutions} className={crumbClass}>Solution Sets</button>}
        </>
      )}

      {view === 'solution-detail' && solutionName && (
        <>{sep}<span className={`${currentClass} truncate`}>{solutionName}</span></>
      )}

      {(view === 'papers' || view === 'paper-detail') && (
        <>
          {sep}
          {view === 'papers'
            ? <span className={currentClass}>Student Papers</span>
            : <button onClick={onPapers} className={crumbClass}>Student Papers</button>}
        </>
      )}

      {view === 'paper-detail' && assignmentName && (
        <>{sep}<span className={`${currentClass} truncate`}>{assignmentName}</span></>
      )}
    </nav>
  )
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-14 h-14" fill="none" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1H3V7z" fill="#60a5fa" />
      <path d="M3 9h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" fill="#3b82f6" />
    </svg>
  )
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-14 h-14" fill="none" aria-hidden="true">
      <path d="M6 3h7l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="#e5e7eb" />
      <path d="M13 3l5 5h-5V3z" fill="#9ca3af" />
      <path d="M7.5 12h9M7.5 15h9M7.5 18h6" stroke="#9ca3af" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function FolderTile({ label, count, icon = 'folder', alert = false, alertTitle, onClick }) {
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-center gap-2 p-5 rounded-xl border border-gray-200 bg-white hover:border-blue-400 hover:shadow-sm transition-all"
    >
      <div className="relative">
        {icon === 'file' ? <FileIcon /> : <FolderIcon />}
        {count != null && (
          <span className="absolute -top-1 -right-2 min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center text-xs font-semibold rounded-full bg-gray-700 text-white">
            {count}
          </span>
        )}
        {alert && (
          <span
            className="absolute -bottom-0.5 -right-1 w-3 h-3 rounded-full bg-red-500 border-2 border-white"
            title={alertTitle ?? 'Needs review'}
          />
        )}
      </div>
      <span className="text-sm font-medium text-gray-800 text-center truncate w-full">{label}</span>
    </button>
  )
}

function CollapsibleSection({ title, count, dotColor, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 mb-3 text-sm font-semibold text-gray-600 hover:text-gray-900"
      >
        <svg
          viewBox="0 0 20 20"
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="currentColor"
        >
          <path d="M7 5l6 5-6 5V5z" />
        </svg>
        {dotColor && <span className={`w-2 h-2 rounded-full inline-block ${dotColor}`} />}
        {title} ({count})
      </button>
      {open && children}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Existing helpers (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
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
              Grading in progress - {finished} of {total} complete
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
                  {count} student{count !== 1 ? 's' : ''} - {pct}-{pct + 9}%
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
