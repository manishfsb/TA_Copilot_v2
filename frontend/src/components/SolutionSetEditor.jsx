import { useState, useEffect } from 'react'
import RubricEditor from './RubricEditor'
import DocPane from './DocPane'

const API = 'http://localhost:8000'

/**
 * Split rubric editor: the parsed rubric on the left, the solution PDF on the right
 * so the TA can compare Claude's extraction against the source and fix it inline.
 *
 * Owns loading the assignment, the rubric state, saving (PUT /assignments/:id/rubric),
 * and re-grading. Used both in-place on the Dashboard ("Solution Sets" folder) and by
 * the /assignments/:id/edit-rubric route.
 *
 * Saving the rubric does NOT auto-regrade existing submissions - the TA triggers that
 * explicitly via "Re-grade all" or per-submission on the Results page.
 */
export default function SolutionSetEditor({ assignmentId }) {
  const [assignment, setAssignment] = useState(null)
  const [rubric, setRubric] = useState([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

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
      body: form,
    })
    setSaving(false)
    setMsg(res.ok
      ? 'Rubric saved. Existing grades unchanged - use Re-grade to apply.'
      : 'Failed to save. Check backend logs.')
  }

  const regradeAll = async () => {
    const subs = assignment?.submissions || []
    if (!window.confirm(`Re-grade ALL ${subs.length} submissions for "${assignment.name}"? This will queue grading jobs for each student.`)) return
    setMsg('Queuing re-grades...')
    for (const sub of subs) {
      if (!sub.finalized) {
        await fetch(`${API}/grades/submission/${sub.id}/regrade`, { method: 'POST' })
      }
    }
    setMsg('Re-grade jobs queued. Refresh the dashboard in a minute to see updated scores.')
  }

  if (!assignment) return <p className="text-gray-400 text-sm">Loading...</p>

  const subCount = assignment.submissions?.length || 0

  return (
    <div className="flex flex-col gap-4">
      {/* Header: name + actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{assignment.name}</h2>
          <p className="text-xs text-gray-400 mt-0.5">Compare the rubric against the solution set and fix anything Claude got wrong.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={regradeAll}
            disabled={!subCount}
            className="text-sm border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            Re-grade all ({subCount})
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

      {/* Split: rubric left, solution PDF right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <RubricEditor rubric={rubric} onChange={setRubric} />
        <DocPane src={`${API}/files/solution/${assignmentId}`} title={`${assignment.name} solution`} />
      </div>
    </div>
  )
}
