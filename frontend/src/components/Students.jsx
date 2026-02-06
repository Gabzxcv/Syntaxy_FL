import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Students.css';

const API = 'http://localhost:5000/api/v1';

const DEFAULT_SECTIONS = [
  {
    id: 1,
    name: 'Section A - Morning',
    students: [
      { id: 1, name: 'Alice Johnson', email: 'alice@example.com', submissions: 5 },
      { id: 2, name: 'Bob Smith', email: 'bob@example.com', submissions: 3 },
    ],
  },
  {
    id: 2,
    name: 'Section B - Afternoon',
    students: [
      { id: 3, name: 'Carol Williams', email: 'carol@example.com', submissions: 7 },
      { id: 4, name: 'David Brown', email: 'david@example.com', submissions: 4 },
    ],
  },
  {
    id: 3,
    name: 'Section C - Evening',
    students: [
      { id: 5, name: 'Emma Davis', email: 'emma@example.com', submissions: 6 },
    ],
  },
];

function Students() {
  const navigate = useNavigate();
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  const [activeSection, setActiveSection] = useState(null);
  const [newSectionName, setNewSectionName] = useState('');
  const [showAddSection, setShowAddSection] = useState(false);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [addStudentSection, setAddStudentSection] = useState('');

  // Get user info from localStorage for sidebar
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : { username: 'User', email: 'user@email.com', full_name: 'User' };

  const totalStudents = sections.reduce((acc, s) => acc + s.students.length, 0);
  const totalSubmissions = sections.reduce((acc, s) => acc + s.students.reduce((a, st) => a + st.submissions, 0), 0);

  function handleLogout() {
    const token = localStorage.getItem('token');
    if (token) {
      fetch('http://localhost:5000/api/v1/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }

  function addSection() {
    if (!newSectionName.trim()) return;
    const newSection = {
      id: Date.now(),
      name: newSectionName.trim(),
      students: [],
    };
    setSections(prev => [...prev, newSection]);
    setNewSectionName('');
    setShowAddSection(false);
  }

  function deleteSection(sectionId) {
    setSections(prev => prev.filter(s => s.id !== sectionId));
    if (activeSection === sectionId) setActiveSection(null);
  }

  function addStudent() {
    if (!newStudentName.trim() || !newStudentEmail.trim() || !addStudentSection) return;
    const sectionId = parseInt(addStudentSection);
    const newStudent = {
      id: Date.now(),
      name: newStudentName.trim(),
      email: newStudentEmail.trim(),
      submissions: 0,
    };
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, students: [...s.students, newStudent] } : s
    ));
    setNewStudentName('');
    setNewStudentEmail('');
    setAddStudentSection('');
    setShowAddStudent(false);
  }

  const displayedStudents = activeSection
    ? sections.find(s => s.id === activeSection)?.students || []
    : sections.flatMap(s => s.students);

  return (
    <div className="students-layout">
      {/* Side Panel */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="sidebar-logo">Dashboard</h1>
        </div>
        
        <nav className="sidebar-nav">
          <button className="nav-item" onClick={() => navigate('/dashboard')}>
            <span className="nav-icon">📊</span>
            Dashboard
          </button>
          <button className="nav-item" onClick={() => navigate('/analyzer')}>
            <span className="nav-icon">⚙️</span>
            Compiler Area
          </button>
          <button className="nav-item" onClick={() => navigate('/files')}>
            <span className="nav-icon">📁</span>
            Files
          </button>
          <button className="nav-item active">
            <span className="nav-icon">📈</span>
            Analysis Results
          </button>
          <button className="nav-item" onClick={() => navigate('/refactoring')}>
            <span className="nav-icon">🔄</span>
            Refactoring
          </button>
          <button className="nav-item" onClick={() => navigate('/history')}>
            <span className="nav-icon">📜</span>
            History
          </button>
          <button className="nav-item" onClick={() => navigate('/settings')}>
            <span className="nav-icon">⚙️</span>
            Settings
          </button>
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item help-btn">
            <span className="nav-icon">❓</span>
            Help
          </button>
          <div className="user-profile">
            <div className="user-avatar">
              {(user.full_name || user.username).charAt(0).toUpperCase()}
            </div>
            <div className="user-info-sidebar">
              <div className="user-name">{user.full_name || user.username}</div>
              <div className="user-email">{user.email}</div>
            </div>
          </div>
          <button className="btn-logout-sidebar" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="students-header">
          <div className="header-left">
            <h2 className="page-title">Analysis Results</h2>
            <p className="page-subtitle">View results by section and manage student submissions</p>
          </div>
        </header>

        <div className="students-content">
          {/* Statistics Cards */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                📂
              </div>
              <div className="stat-info">
                <div className="stat-label">Sections</div>
                <div className="stat-value">{sections.length}</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                👥
              </div>
              <div className="stat-info">
                <div className="stat-label">Total Students</div>
                <div className="stat-value">{totalStudents}</div>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                📝
              </div>
              <div className="stat-info">
                <div className="stat-label">Total Submissions</div>
                <div className="stat-value">{totalSubmissions}</div>
              </div>
            </div>
          </div>

          {/* Sections Filter */}
          <section className="sections-filter">
            <div className="section-header">
              <h3 className="section-title">Sections</h3>
              <button className="action-btn primary" onClick={() => setShowAddSection(!showAddSection)}>
                <span className="btn-icon">➕</span>
                Add Section
              </button>
            </div>

            {showAddSection && (
              <div className="add-section-form">
                <input
                  type="text"
                  className="section-input"
                  placeholder="Enter section name..."
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addSection()}
                />
                <button className="action-btn primary" onClick={addSection}>Create</button>
                <button className="action-btn secondary" onClick={() => setShowAddSection(false)}>Cancel</button>
              </div>
            )}

            <div className="section-tabs">
              <button
                className={`section-tab ${activeSection === null ? 'active' : ''}`}
                onClick={() => setActiveSection(null)}
              >
                All Sections
              </button>
              {sections.map(section => (
                <div key={section.id} className="section-tab-wrapper">
                  <button
                    className={`section-tab ${activeSection === section.id ? 'active' : ''}`}
                    onClick={() => setActiveSection(section.id)}
                  >
                    {section.name} ({section.students.length})
                  </button>
                  <button className="section-delete-btn" onClick={() => deleteSection(section.id)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Students Table Section */}
          <section className="students-section">
            <div className="section-header">
              <h3 className="section-title">
                {activeSection
                  ? sections.find(s => s.id === activeSection)?.name || 'Students'
                  : 'All Students'}
              </h3>
              <button className="action-btn primary" onClick={() => setShowAddStudent(!showAddStudent)}>
                <span className="btn-icon">👤</span>
                Add Student
              </button>
            </div>

            {showAddStudent && (
              <div className="add-student-form">
                <input
                  type="text"
                  className="section-input"
                  placeholder="Student name..."
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                />
                <input
                  type="email"
                  className="section-input"
                  placeholder="Email..."
                  value={newStudentEmail}
                  onChange={(e) => setNewStudentEmail(e.target.value)}
                />
                <select
                  className="section-input section-select"
                  value={addStudentSection}
                  onChange={(e) => setAddStudentSection(e.target.value)}
                >
                  <option value="">Select section...</option>
                  {sections.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button className="action-btn primary" onClick={addStudent}>Add</button>
                <button className="action-btn secondary" onClick={() => setShowAddStudent(false)}>Cancel</button>
              </div>
            )}

            <div className="table-container">
              <table className="students-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Submissions</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedStudents.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                        No students in this section yet
                      </td>
                    </tr>
                  ) : (
                    displayedStudents.map((student) => (
                      <tr key={student.id}>
                        <td>
                          <span className="student-id">#{student.id}</span>
                        </td>
                        <td>
                          <div className="student-name-cell">
                            <div className="student-avatar-small">
                              {student.name.charAt(0)}
                            </div>
                            <span className="student-name">{student.name}</span>
                          </div>
                        </td>
                        <td>
                          <span className="student-email">{student.email}</span>
                        </td>
                        <td>
                          <span className="submission-badge">{student.submissions}</span>
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button className="icon-btn view">
                              <span>👁️</span>
                            </button>
                            <button className="icon-btn edit">
                              <span>✏️</span>
                            </button>
                            <button className="icon-btn delete">
                              <span>🗑️</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default Students;