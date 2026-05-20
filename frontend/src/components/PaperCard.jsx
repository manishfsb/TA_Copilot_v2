import { Link } from 'react-router-dom'

const STATUS_STYLES = {
  pending:  'bg-gray-100 text-gray-500',
  grading:  'bg-yellow-100 text-yellow-700',
  done:     'bg-green-100 text-green-700',
  flagged:  'bg-red-100 text-red-700',
}

const STATUS_LABEL = {
  pending: 'Pending',
  grading: 'Grading…',
  done:    'Done',
  flagged: 'Needs Review',
}

export default function PaperCard({ submission }) {
  const { id, student_name, student_id, status, total_score, max_score, confidence, flag_reason, finalized } = submission
  const pct = max_score ? Math.round((total_score / max_score) * 100) : null

  const borderColor = finalized
    ? 'border-blue-200'
    : status === 'flagged'
      ? 'border-red-200'
      : 'border-gray-200'

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-4 flex flex-col gap-3 ${borderColor}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{student_name}</p>
          {student_id && (
            <p className="text-xs font-mono text-gray-400 mt-0.5">{student_id}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[status] ?? STATUS_STYLES.pending}`}>
            {finalized ? 'Finalized' : (STATUS_LABEL[status] ?? status)}
          </span>
        </div>
      </div>

      {/* Score */}
      {pct !== null && (
        <div className="flex items-end gap-2">
          <span className="text-2xl font-bold text-blue-700 leading-none">{pct}%</span>
          <span className="text-xs text-gray-400 mb-0.5">{total_score} / {max_score} pts</span>
        </div>
      )}

      {/* OCR confidence bar */}
      {confidence != null && (
        <ConfidenceBar confidence={confidence} />
      )}

      {/* Flag reason */}
      {flag_reason && !finalized && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-2.5 py-1.5 leading-snug line-clamp-2">
          {flag_reason}
        </p>
      )}

      {/* Action link */}
      {(status === 'done' || status === 'flagged') && (
        <Link
          to={`/results/${id}`}
          className="mt-auto text-sm text-blue-600 hover:text-blue-800 font-medium hover:underline"
        >
          {finalized ? 'View scoresheet →' : 'View breakdown →'}
        </Link>
      )}
    </div>
  )
}

function ConfidenceBar({ confidence }) {
  const pct   = Math.round(confidence * 100)
  const color = pct >= 85 ? 'bg-green-400' : pct >= 65 ? 'bg-yellow-400' : 'bg-red-400'
  const label = pct >= 85 ? 'High' : pct >= 65 ? 'Medium' : 'Low'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-28 text-right">OCR {label} ({pct}%)</span>
    </div>
  )
}
