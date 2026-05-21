import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import RubricEditor from '../components/RubricEditor'

const API = 'http://localhost:8000'

/**
 * Edit an assignment's rubric AFTER it's been created. Used when the TA
 * discovers parser errors mid-grading. Existing question_grades are NOT
 * auto-invalidated — TA explicitly re-grades affected students from here.
 */
export default function EditRubric() {
  const { assignmentId } = useParams()
  const [assignment, setAssignment] = useState(null)
  const [rubric, setRubric] = useState([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    fetch(`${API}/assignments/${assignmentId}`)
      .then(r => r.json())
      .then(a => {
        setAssignment(a)
        setRubric(a.rubric || [])
      })
  }, [assignmentId])

  const handleSave = async () => {
    setSaving(true)
    setMsg('')
    const form = new FormData()
    form.append('rubric_json', JSON.stringify(rubric))
    const res = await fetch(`${API}/assignments/${assignmentId}/rubric`, {
      method: 'PUT',
      body: form
    })
    setSaving(false)
    if (res.ok) {
      setMsg('Rubric saved. Existing grades unchanged - use the Re-grade button on a submission to apply.')
    } else {
      setMsg('Failed to save. Check backend logs.')
    }
  }

  const regradeAll = async () => {
    if (!window.confirm(`Re-grade ALL ${assignment.submissions?.length || 0} submissions for "${assignment.name}"? This will queue grading jobs for each student.`)) return
    setMsg('Queuing re-grades...')
    for (const sub of (assignment.submissions || [])) {
      if (!sub.finalized) {
        await fetch(`${API}/grades/submission/${sub.id}/regrade`, { method: 'POST' })
      }
    }
    setMsg('Re-grade jobs queued. Refresh the dashboard in a minute to see updated scores.')
  }

  if (!assignment) return <p className="text-gray-400 text-sm">Loading...</p>

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-4">
      <Link to="/" className="text-sm text-blue-500 hover:underline"><- Back to dashboard</Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Rubric</h1>
          <p className="text-sm text-gray-500 mt-1">{assignment.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={regradeAll}
            disabled={!assignment.submissions?.length}
            className="text-sm border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            Re-grade all ({assignment.submissions?.length || 0})
          </button>
          <button
            onClick={handleSave}
            disabled={saving || rubric.length === 0}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save rubric'}
          </button>
        </div>
      </div>

      {msg && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm px-4 py-2 rounded-lg">
          {msg}
        </div>
      )}

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
        <strong>Note:</strong> Saving the rubric does NOT automatically re-grade existing submissions.
        Use "Re-grade all" above, or open an individual submission and click Re-grade there.
        Finalized submissions are skipped - unfinalize them first if you need to re-grade.
      </div>

      <RubricEditor rubric={rubric} onChange={setRubric} />
    </div>
  )
}
