import { Link } from 'react-router-dom'

const STATUS_STYLES = {
  pending:  'bg-gray-100 text-gray-600',
  grading:  'bg-yellow-100 text-yellow-700',
  done:     'bg-green-100 text-green-700',
  flagged:  'bg-red-100 text-red-700',
}

const STATUS_LABEL = {
  pending: 'Pending',
  grading: 'Grading...',
  done:    'Done',
  flagged: 'Needs Review',
}

export default function PaperCard({ submission }) {
  const { id, student_name, status, total_score, max_score, confidence, flag_reason } = submission
  const pct = max_score ? Math.round((total_score / max_score) * 100) : null

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-4 flex flex-col gap-2 ${status === 'flagged' ? 'border-red-300' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-gray-900">{student_name}</p>
          {pct !== null && (
            <p className="text-2xl font-bold text-blue-700 mt-1">
              {total_score} <span className="text-base font-normal text-gray-400">/ {max_score} pts</span>
            </p>
          )}
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_STYLES[status] ?? STATUS_STYLES.pending}`}>
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>

      {confidence !== null && confidence !== undefined && (
        <ConfidenceBar confidence={confidence} />
      )}

      {flag_reason && (
        <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{flag_reason}</p>
      )}

      {status === 'done' || status === 'flagged' ? (
        <Link
          to={`/results/${id}`}
          className="mt-1 text-sm text-blue-600 hover:underline font-medium"
        >
          View breakdown →
        </Link>
      ) : null}
    </div>
  )
}

function ConfidenceBar({ confidence }) {
  const pct = Math.round(confidence * 100)
  const color = pct >= 85 ? 'bg-green-400' : pct >= 65 ? 'bg-yellow-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-14 text-right">OCR {pct}%</span>
    </div>
  )
}
