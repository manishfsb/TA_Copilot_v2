import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

const API = 'http://localhost:8000'

/**
 * Semester-wide gradebook matrix. Rows = students, cols = assignments,
 * cells = scores. Click any cell to jump to that student's Results page.
 * Download as CSV for Blackboard upload.
 */
export default function Gradebook() {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch(`${API}/grades/gradebook`).then(r => r.json()).then(setData)
  }, [])

  if (!data) return <p className="text-gray-400 text-sm">Loading…</p>

  const { assignments, students } = data

  const overallAvg = (student) => {
    const scores = assignments
      .map(a => student.scores[String(a.id)]?.pct)
      .filter(p => p !== null && p !== undefined)
    if (!scores.length) return null
    return Math.round(scores.reduce((s, p) => s + p, 0) / scores.length)
  }

  const downloadCSV = () => {
    const header = ['Student', 'Student ID', ...assignments.map(a => a.name), 'Average'].join(',')
    const rows = students.map(s => {
      const cells = assignments.map(a => s.scores[String(a.id)]?.pct ?? '')
      const avg = overallAvg(s) ?? ''
      return [csvEscape(s.name), csvEscape(s.student_id || ''), ...cells, avg].join(',')
    })
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `gradebook_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gradebook</h1>
          <p className="text-sm text-gray-500 mt-1">
            {students.length} students · {assignments.length} assignments
          </p>
        </div>
        <button
          onClick={downloadCSV}
          disabled={!students.length}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Download CSV
        </button>
      </div>

      {students.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No graded submissions yet.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 sticky left-0 bg-gray-50">Student</th>
                  {assignments.map(a => (
                    <th key={a.id} className="text-center px-3 py-3 font-medium text-gray-600 whitespace-nowrap">
                      {a.name}
                    </th>
                  ))}
                  <th className="text-center px-3 py-3 font-semibold text-gray-700 bg-blue-50">Average</th>
                </tr>
              </thead>
              <tbody>
                {students.map(student => {
                  const avg = overallAvg(student)
                  return (
                    <tr key={student.name} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 sticky left-0 bg-white">
                        <p className="font-medium text-gray-800">{student.name}</p>
                        {student.student_id && (
                          <p className="text-xs font-mono text-gray-400">{student.student_id}</p>
                        )}
                      </td>
                      {assignments.map(a => {
                        const cell = student.scores[String(a.id)]
                        return <GradeCell key={a.id} cell={cell} />
                      })}
                      <td className="text-center px-3 py-3 font-bold text-blue-700 bg-blue-50">
                        {avg !== null ? `${avg}%` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function GradeCell({ cell }) {
  if (!cell) {
    return <td className="text-center px-3 py-3 text-gray-300">—</td>
  }
  const colorClass = cell.flagged
    ? 'text-red-600'
    : cell.finalized
      ? 'text-green-700 font-semibold'
      : 'text-gray-700'
  return (
    <td className="text-center px-3 py-3">
      <Link
        to={`/results/${cell.submission_id}`}
        className={`hover:underline ${colorClass}`}
        title={cell.flagged ? 'Needs review' : cell.finalized ? 'Finalized' : 'Graded'}
      >
        {cell.pct !== null ? `${cell.pct}%` : '—'}
      </Link>
    </td>
  )
}

function csvEscape(value) {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
