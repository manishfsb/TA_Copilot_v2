import { useState } from 'react'

const API = 'http://localhost:8000'

/**
 * Side-panel paper viewer with a toggle between the student's submission
 * and the assignment's solution set. Sticky so it stays visible while the
 * score breakdown is scrolled. Browser handles native PDF rendering.
 */
export default function PaperViewer({ submissionId, assignmentId, studentName, submittedAt }) {
  const [view, setView] = useState('student')   // 'student' | 'solution'

  // submittedAt is used as a cache-buster so the browser never serves a stale
  // PDF if a submission ID gets reused after a DB reset.
  const cacheBuster = submittedAt ? `?t=${encodeURIComponent(submittedAt)}` : ''
  const url = view === 'student'
    ? `${API}/files/submission/${submissionId}${cacheBuster}`
    : `${API}/files/solution/${assignmentId}`

  return (
    <div className="sticky top-4 flex flex-col gap-3 h-[calc(100vh-2rem)]">
      {/* Toggle */}
      <div className="flex bg-gray-100 rounded-lg p-1">
        <ToggleButton
          active={view === 'student'}
          onClick={() => setView('student')}
          label="Student Paper"
        />
        <ToggleButton
          active={view === 'solution'}
          onClick={() => setView('solution')}
          label="Solution Set"
        />
      </div>

      {/* Embedded paper — keyed by URL so the iframe reloads on toggle */}
      <div className="flex-1 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <iframe
          key={url}
          src={url}
          className="w-full h-full border-0"
          title={view === 'student' ? 'Student paper' : 'Solution set'}
        />
      </div>

      {/* File identity — lets TA verify which file is loaded */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        {view === 'student' && studentName && (
          <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">
            submission #{submissionId} · {studentName}
          </span>
        )}
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="ml-auto hover:text-blue-500"
        >
          Open in new tab ↗
        </a>
      </div>
    </div>
  )
}

function ToggleButton({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active
          ? 'bg-white text-blue-700 shadow-sm'
          : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  )
}
