import { useState } from 'react'

const ANSWER_TYPES = ['numerical', 'explanation', 'table', 'set', 'diagram', 'mixed']

const TYPE_COLORS = {
  numerical:   'bg-blue-100 text-blue-700',
  explanation: 'bg-purple-100 text-purple-700',
  table:       'bg-yellow-100 text-yellow-700',
  set:         'bg-green-100 text-green-700',
  diagram:     'bg-orange-100 text-orange-700',
  mixed:       'bg-gray-100 text-gray-600',
}

const BLANK_ITEM = {
  question_key: '',
  problem_label: '',
  sub_part: '',
  correct_answer: '',
  answer_type: 'mixed',
  gradeable: true,
  key_values: [],
  max_score: 100.0,
}

export default function RubricEditor({ rubric, onChange }) {
  // Track which rows have been EXPLICITLY collapsed. Defaulting to a Set means
  // all rows are expanded by default - and multiple can be expanded at once.
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [adding, setAdding] = useState(false)
  const [newItem, setNewItem] = useState({ ...BLANK_ITEM })

  const isExpanded = (index) => !collapsed.has(index)
  const toggleExpand = (index) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const update = (index, patch) => {
    onChange(rubric.map((item, i) => i === index ? { ...item, ...patch } : item))
  }

  const remove = (index) => {
    onChange(rubric.filter((_, i) => i !== index))
  }

  const addItem = () => {
    if (!newItem.question_key || !newItem.correct_answer) return
    onChange([...rubric, { ...newItem, max_score: 100.0 }])
    setNewItem({ ...BLANK_ITEM })
    setAdding(false)
  }

  const allCollapsed = rubric.length > 0 && collapsed.size === rubric.length
  const expandAll = () => setCollapsed(new Set())
  const collapseAll = () => setCollapsed(new Set(rubric.map((_, i) => i)))

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-800 flex items-center justify-between gap-3">
        <span>Review each question below. Edit anything Claude got wrong - labels, answer text, type, or whether it needs manual grading. All questions are worth 100 pts automatically.</span>
        {rubric.length > 1 && (
          <button
            onClick={allCollapsed ? expandAll : collapseAll}
            className="text-xs text-blue-700 hover:underline whitespace-nowrap flex-shrink-0"
          >
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
      </div>

      {rubric.map((item, index) => (
        <RubricRow
          key={index}
          item={item}
          expanded={isExpanded(index)}
          onToggleExpand={() => toggleExpand(index)}
          onChange={(patch) => update(index, patch)}
          onDelete={() => remove(index)}
        />
      ))}

      {/* Add question */}
      {adding ? (
        <div className="bg-white border-2 border-dashed border-blue-300 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold text-gray-700">Add missing question</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Matching key <span className="text-red-400">*</span></label>
              <input
                placeholder="e.g. AT2.1c"
                value={newItem.question_key}
                onChange={e => setNewItem(p => ({ ...p, question_key: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Display label</label>
              <input
                placeholder="e.g. Ang and Tang 2.1 (c)"
                value={newItem.problem_label}
                onChange={e => setNewItem(p => ({ ...p, problem_label: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Sub-part</label>
              <input
                placeholder="e.g. c  (leave blank if none)"
                value={newItem.sub_part}
                onChange={e => setNewItem(p => ({ ...p, sub_part: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Answer type</label>
              <select
                value={newItem.answer_type}
                onChange={e => setNewItem(p => ({ ...p, answer_type: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {ANSWER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Correct answer <span className="text-red-400">*</span></label>
            <textarea
              rows={3}
              placeholder="Paste or type the correct answer from the solution set"
              value={newItem.correct_answer}
              onChange={e => setNewItem(p => ({ ...p, correct_answer: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none font-mono"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Manual grading only</label>
            <Toggle checked={!newItem.gradeable} onChange={v => setNewItem(p => ({ ...p, gradeable: !v }))} />
          </div>
          <div className="flex gap-2">
            <button
              onClick={addItem}
              disabled={!newItem.question_key || !newItem.correct_answer}
              className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add
            </button>
            <button
              onClick={() => { setAdding(false); setNewItem({ ...BLANK_ITEM }) }}
              className="text-gray-500 px-4 py-1.5 rounded-lg text-sm hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
        >
          + Add missing question
        </button>
      )}
    </div>
  )
}

function RubricRow({ item, expanded, onToggleExpand, onChange, onDelete }) {
  const isManual = !item.gradeable
  const typeColor = TYPE_COLORS[item.answer_type] || TYPE_COLORS.mixed

  return (
    <div className={`bg-white rounded-xl border ${isManual ? 'border-orange-200' : 'border-gray-200'}`}>
      {/* Header row - always visible */}
      <div className="flex items-center gap-3 px-4 py-3">

        {/* Key badge - editable */}
        <div className="flex-shrink-0">
          <input
            title="Matching key - must match what the OCR will label this question"
            value={item.question_key}
            onChange={e => onChange({ question_key: e.target.value })}
            className="w-20 text-xs font-mono bg-gray-100 border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 text-center"
          />
        </div>

        {/* Label - editable */}
        <input
          value={item.problem_label}
          onChange={e => onChange({ problem_label: e.target.value })}
          className="flex-1 text-sm font-semibold text-gray-800 border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none bg-transparent py-0.5"
          placeholder="Problem label"
        />

        {/* Sub-part - editable */}
        <input
          value={item.sub_part || ''}
          onChange={e => onChange({ sub_part: e.target.value || null })}
          placeholder="part"
          className="w-12 text-xs text-center border border-gray-200 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
          title="Sub-part letter (e.g. a, b, c)"
        />

        {/* Answer type dropdown */}
        <select
          value={item.answer_type}
          onChange={e => onChange({ answer_type: e.target.value })}
          className={`text-xs px-2 py-1 rounded-full border-0 font-medium focus:outline-none focus:ring-1 focus:ring-blue-400 ${typeColor}`}
        >
          {ANSWER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Manual toggle */}
        <div className="flex items-center gap-1.5 flex-shrink-0" title="Toggle manual grading">
          <span className="text-xs text-gray-400">Manual</span>
          <Toggle checked={isManual} onChange={v => onChange({ gradeable: !v })} />
        </div>

        <button
          onClick={onToggleExpand}
          className="text-gray-400 hover:text-blue-500 text-sm px-1"
          title="View / edit correct answer"
        >
          {expanded ? '▲' : '▼'}
        </button>
        <button
          onClick={() => {
            if (window.confirm(`Remove "${item.problem_label || item.question_key}"? Only do this if Claude hallucinated it.`))
              onDelete()
          }}
          className="text-gray-300 hover:text-red-400 text-lg leading-none"
          title="Remove question"
        >
          x
        </button>
      </div>

      {/* Expanded correct answer editor */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 flex flex-col gap-2">
          <label className="text-xs font-medium text-gray-500">Correct answer (Claude's extraction - edit if wrong)</label>
          <textarea
            rows={4}
            value={item.correct_answer}
            onChange={e => onChange({ correct_answer: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
          />
          {isManual && (
            <p className="text-xs text-orange-600 bg-orange-50 rounded px-2 py-1">
              Manual  grading - this question will be flagged for your review after OCR. Enter the score yourself in the Results page.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-8 h-4 rounded-full transition-colors ${checked ? 'bg-orange-400' : 'bg-gray-200'}`}
    >
      <span
        className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
      />
    </button>
  )
}
