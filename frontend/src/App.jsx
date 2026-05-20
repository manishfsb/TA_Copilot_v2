import { Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import Results from './pages/Results'
import Scoresheet from './pages/Scoresheet'
import Gradebook from './pages/Gradebook'
import EditRubric from './pages/EditRubric'

function NavItem({ to, label }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          isActive
            ? 'bg-blue-700 text-white'
            : 'text-blue-100 hover:bg-blue-600 hover:text-white'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-blue-800 shadow print:hidden">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
          <span className="text-white font-bold text-lg tracking-tight">AutoGrader</span>
          <div className="flex gap-2">
            <NavItem to="/" label="Dashboard" />
            <NavItem to="/upload" label="Upload" />
            <NavItem to="/gradebook" label="Gradebook" />
          </div>
        </div>
      </nav>
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8 print:py-2 print:px-0">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/gradebook" element={<Gradebook />} />
          <Route path="/results/:submissionId" element={<Results />} />
          <Route path="/scoresheet/:submissionId" element={<Scoresheet />} />
          <Route path="/assignments/:assignmentId/edit-rubric" element={<EditRubric />} />
        </Routes>
      </main>
    </div>
  )
}
