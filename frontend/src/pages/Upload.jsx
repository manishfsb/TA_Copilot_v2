import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import RubricEditor from '../components/RubricEditor'

const API = 'http://localhost:8000'

// Step 1: choose existing assignment OR start creating a new one
// Step 2 (new only): upload solution set → Claude parses it → TA reviews rubric + sets points
// Step 3: drop student papers, confirm names, submit

export default function Upload() {
  const [step, setStep] = useState(1)
  const [assignments, setAssignments] = useState([])
  const [mode, setMode] = useState('existing')           // 'existing' | 'new'
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('')

  // New assignment state
  const [newName, setNewName] = useState('')
  const [solutionFile, setSolutionFile] = useState(null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [rubric, setRubric] = useState([])
  const [tmpPath, setTmpPath] = useState('')
  const [savingAssignment, setSavingAssignment] = useState(false)
  const [savedAssignmentId, setSavedAssignmentId] = useState(null)

  // Step 3 state
  const [submissions, setSubmissions] = useState([])
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState([])

  const navigate = useNavigate()

  useEffect(() => {
    fetch(`${API}/assignments/`)
      .then((r) => r.json())
      .then((data) => {
        setAssignments(data)
        if (data.length > 0) {
          // Default flow: existing assignments are the common case, so pre-select
          // the most recent one. Creating a "New" assignment becomes an explicit choice.
          setMode('existing')
          setSelectedAssignmentId(String(data[0].id))
        } else {
          // First time using the app — force New mode
          setMode('new')
        }
      })
  }, [])

  // Detect name collisions while the user types a new assignment name.
  // Prevents accidentally creating "HW1" twice.
  const nameCollision = newName.trim()
    ? assignments.find(a => a.name.toLowerCase().trim() === newName.toLowerCase().trim())
    : null

  // ── Step 1 handlers ──────────────────────────────────────────
  const handleStep1Continue = () => {
    if (mode === 'existing' && !selectedAssignmentId) return
    setStep(mode === 'new' ? 2 : 3)
  }

  // ── Step 2 handlers ──────────────────────────────────────────
  const handleParseSolution = async () => {
    if (!solutionFile) return
    setParsing(true)
    setParseError('')
    setRubric([])

    const form = new FormData()
    form.append('solution_file', solutionFile)

    try {
      const res = await fetch(`${API}/assignments/preview-rubric`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Parsing failed')
      setTmpPath(data.tmp_path)
      setRubric(data.rubric)
    } catch (err) {
      setParseError(err.message)
    } finally {
      setParsing(false)
    }
  }

  const handleSaveAssignment = async () => {
    if (!newName || rubric.length === 0) return
    setSavingAssignment(true)

    const form = new FormData()
    form.append('name', newName)
    form.append('solution_tmp_path', tmpPath)
    form.append('rubric_json', JSON.stringify(rubric))

    try {
      const res = await fetch(`${API}/assignments/`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to save assignment')
      setSavedAssignmentId(data.id)
      setAssignments((prev) => [data, ...prev])
      setStep(3)
    } catch (err) {
      setParseError(err.message)
    } finally {
      setSavingAssignment(false)
    }
  }

  // ── Step 3 handlers ──────────────────────────────────────────
  const activeAssignmentId = mode === 'new' ? savedAssignmentId : selectedAssignmentId

  const addFiles = (files) => {
    const items = Array.from(files).map((f) => ({
      file: f,
      studentName: f.name.replace(/\.[^.]+$/, '').replace(/[_\-]/g, ' '),
      studentId: '',
      id: Math.random().toString(36).slice(2),
    }))
    setSubmissions((prev) => [...prev, ...items])
  }

  const updateSubmission = (id, patch) => {
    setSubmissions((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s))
  }

  const handleGrade = async () => {
    if (!submissions.length || !activeAssignmentId) return
    setUploading(true)
    setResults([])

    const outcomes = []
    for (const sub of submissions) {
      const form = new FormData()
      form.append('student_name', sub.studentName)
      form.append('student_id', sub.studentId || '')
      form.append('file', sub.file)
      try {
        const res = await fetch(`${API}/upload/${activeAssignmentId}`, { method: 'POST', body: form })
        const data = await res.json()
        outcomes.push({ name: sub.studentName, ok: res.ok, detail: data.detail })
      } catch {
        outcomes.push({ name: sub.studentName, ok: false })
      }
    }

    setResults(outcomes)
    setUploading(false)
    setTimeout(() => navigate('/'), 2000)
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      {/* Step indicator */}
      <StepIndicator current={step} mode={mode} />

      <h1 className="text-2xl font-bold text-gray-900">
        {step === 1 && 'Select Assignment'}
        {step === 2 && 'Review Solution Set'}
        {step === 3 && 'Upload Student Papers'}
      </h1>

      {/* ── Step 1 ── */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4">
          {/* Mode tabs — only shown when there's a meaningful choice */}
          {assignments.length > 0 && (
            <div className="flex gap-3">
              <ModeBtn active={mode === 'existing'} onClick={() => setMode('existing')} label="Add to existing" />
              <ModeBtn active={mode === 'new'} onClick={() => setMode('new')} label="Create new" />
            </div>
          )}

          {mode === 'existing' && (
            <div className="flex flex-col gap-2">
              <label className="text-xs text-gray-500">Add student papers to:</label>
              <select
                value={selectedAssignmentId}
                onChange={(e) => setSelectedAssignmentId(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {assignments.length === 0 && <option value="">No assignments yet</option>}
                {assignments.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400">
                The solution set and rubric are already saved — you'll go straight to uploading student papers.
              </p>
            </div>
          )}

          {mode === 'new' && (
            <div className="flex flex-col gap-3">
              {assignments.length === 0 && (
                <p className="text-sm text-gray-600">
                  Welcome — let's create your first assignment. Upload the solution set and Claude will parse it into a rubric.
                </p>
              )}
              <input
                type="text"
                placeholder="Assignment name (e.g. HW 3)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />

              {/* Collision warning — prevents accidental duplicate HW1s */}
              {nameCollision && (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm px-3 py-2 rounded-lg flex items-center justify-between gap-3">
                  <span>
                    An assignment named <strong>"{nameCollision.name}"</strong> already exists.
                    You probably want to add papers to that one.
                  </span>
                  <button
                    onClick={() => {
                      setMode('existing')
                      setSelectedAssignmentId(String(nameCollision.id))
                      setNewName('')
                      setSolutionFile(null)
                    }}
                    className="text-amber-900 underline whitespace-nowrap font-medium hover:text-amber-700"
                  >
                    Use existing →
                  </button>
                </div>
              )}

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Solution set (PDF or .docx)</label>
                <input
                  type="file"
                  accept=".pdf,.docx"
                  onChange={(e) => setSolutionFile(e.target.files[0])}
                  className="text-sm text-gray-700"
                />
              </div>
            </div>
          )}

          <button
            onClick={handleStep1Continue}
            disabled={
              mode === 'existing'
                ? !selectedAssignmentId
                : (!newName || !solutionFile || !!nameCollision)
            }
            className="bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Continue
          </button>
        </div>
      )}

      {/* ── Step 2: Rubric review (new assignment only) ── */}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          {rubric.length === 0 && !parsing && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
              <p className="text-sm text-gray-600">
                Claude will read your solution set and extract each problem and sub-part. Review what it found and fix anything before grading starts.
              </p>
              <button
                onClick={handleParseSolution}
                className="bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Parse solution set
              </button>
              {parseError && <p className="text-sm text-red-600">{parseError}</p>}
            </div>
          )}

          {parsing && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <p className="text-blue-600 font-medium animate-pulse">Reading solution set…</p>
              <p className="text-xs text-gray-400 mt-2">Claude is extracting each problem and sub-part</p>
            </div>
          )}

          {rubric.length > 0 && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                Set the point value for each question below. Diagram-only answers (like sample space plots) are marked as manual grading and worth 0 automatic points.
              </div>
              <RubricEditor rubric={rubric} onChange={setRubric} />
              {parseError && <p className="text-sm text-red-600">{parseError}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => { setRubric([]); setParseError('') }}
                  className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Re-parse
                </button>
                <button
                  onClick={handleSaveAssignment}
                  disabled={savingAssignment || rubric.length === 0}
                  className="flex-2 bg-blue-600 text-white py-2 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {savingAssignment ? 'Saving…' : 'Save assignment & continue'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Step 3: Student papers ── */}
      {step === 3 && (
        <div className="flex flex-col gap-4">
          {/* Drop zone */}
          <div
            onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById('paper-input').click()}
            className="border-2 border-dashed border-blue-300 rounded-xl p-10 text-center bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer"
          >
            <p className="text-blue-600 font-medium">Drop student papers here</p>
            <p className="text-xs text-gray-400 mt-1">PDF, JPG, or PNG — one file per student</p>
            <input
              id="paper-input"
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {submissions.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-[150px_1fr_140px_24px] gap-3 px-4 text-xs font-medium text-gray-400">
                <span>File</span>
                <span>Identifier (shown in app)</span>
                <span>Student ID (optional)</span>
                <span></span>
              </div>
              {submissions.map((s) => (
                <div key={s.id} className="grid grid-cols-[150px_1fr_140px_24px] gap-3 items-center bg-white border border-gray-200 rounded-lg px-4 py-2">
                  <span className="text-gray-400 text-xs truncate" title={s.file.name}>{s.file.name}</span>
                  <input
                    type="text"
                    value={s.studentName}
                    onChange={(e) => updateSubmission(s.id, { studentName: e.target.value })}
                    className="border-b border-gray-200 text-sm px-1 py-0.5 focus:outline-none focus:border-blue-400"
                    placeholder="e.g. S-001"
                  />
                  <input
                    type="text"
                    value={s.studentId}
                    onChange={(e) => updateSubmission(s.id, { studentId: e.target.value })}
                    className="border-b border-gray-200 text-sm px-1 py-0.5 focus:outline-none focus:border-blue-400 font-mono"
                    placeholder="e.g. 123456"
                  />
                  <button
                    onClick={() => setSubmissions((p) => p.filter((x) => x.id !== s.id))}
                    className="text-gray-300 hover:text-red-400 text-xl leading-none"
                  >×</button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleGrade}
            disabled={uploading || submissions.length === 0}
            className="bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {uploading
              ? 'Uploading…'
              : `Grade ${submissions.length} submission${submissions.length !== 1 ? 's' : ''}`}
          </button>

          {results.length > 0 && (
            <div className="flex flex-col gap-2">
              {results.map((r, i) => (
                <div key={i} className={`text-sm px-4 py-2 rounded-lg ${r.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {r.ok ? '✓' : '✗'} {r.name} — {r.ok ? 'queued for grading' : (r.detail || 'upload failed')}
                </div>
              ))}
              <p className="text-xs text-gray-400 text-center mt-1">Redirecting to dashboard…</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StepIndicator({ current, mode }) {
  const steps = mode === 'new'
    ? ['Assignment', 'Review Rubric', 'Upload Papers']
    : ['Assignment', 'Upload Papers']
  const indices = mode === 'new' ? [1, 2, 3] : [1, 3]

  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => {
        const stepNum = indices[i]
        const active = stepNum === current
        const done = stepNum < current
        return (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
              ${done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {done ? '✓' : i + 1}
            </div>
            <span className={`text-sm ${active ? 'font-medium text-gray-800' : 'text-gray-400'}`}>{label}</span>
            {i < steps.length - 1 && <div className="w-8 h-px bg-gray-200" />}
          </div>
        )
      })}
    </div>
  )
}

function ModeBtn({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
        active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
      }`}
    >
      {label}
    </button>
  )
}
