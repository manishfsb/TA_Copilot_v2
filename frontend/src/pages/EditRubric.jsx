import { useParams, Link } from 'react-router-dom'
import SolutionSetEditor from '../components/SolutionSetEditor'

/**
 * Edit an assignment's rubric AFTER it's been created (parser errors found
 * mid-grading). Thin wrapper around the shared split editor - same view the TA
 * gets when opening a solution set from the Dashboard's Solution Sets folder.
 */
export default function EditRubric() {
  const { assignmentId } = useParams()

  return (
    <div className="flex flex-col gap-4">
      <Link to="/" className="text-sm text-blue-500 hover:underline">← Back to dashboard</Link>
      <h1 className="text-2xl font-bold text-gray-900">Edit Rubric</h1>
      <SolutionSetEditor assignmentId={assignmentId} />
    </div>
  )
}
