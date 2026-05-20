import { useState } from 'react'

const API = 'http://localhost:8000'

/**
 * Side-panel paper viewer with a toggle between the student's submission
 * and the assignment's solution set. Sticky so it stays visible while the
 * score breakdown is scrolled. Browser handles native PDF rendering.
 */
export default function PaperViewer({ submissionId, assignmentId }) {
  const [view, setView] = useState('student')   // 'student' | 'solution'

  const url = view === 'student'
    ? `${API}/files/submission/${submissionId}`
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

      {/* Open in new tab — fallback if browser can't render inline */}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-gray-400 hover:text-blue-500 text-center"
      >
        Open in new tab ↗
      </a>
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
