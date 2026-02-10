import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from './Logo';
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

  // Get user info from localStorage for sidebar
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : { username: 'User', email: 'user@email.com', full_name: 'User', role: 'instructor' };
  const isStudent = user.role === 'student';

  const savedSections = localStorage.getItem('savedSections');
  const [sections, setSections] = useState(savedSections ? JSON.parse(savedSections) : DEFAULT_SECTIONS);
  const [activeSection, setActiveSection] = useState(null);
  const [newSectionName, setNewSectionName] = useState('');
  const [showAddSection, setShowAddSection] = useState(false);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [addStudentSection, setAddStudentSection] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [registeredStudents, setRegisteredStudents] = useState([]);
  const [selectedRegisteredStudent, setSelectedRegisteredStudent] = useState('');
  const [studentResults] = useState(() => {
    if (!isStudent) return null;
    const results = localStorage.getItem('studentResults');
    if (results) {
      try {
        const all = JSON.parse(results);
        const mine = all.filter(r => r.studentEmail && r.studentEmail.toLowerCase() === user.email.toLowerCase());
        if (mine.length > 0) return mine;
      } catch { /* ignore */ }
    }
    return null;
  });

  useEffect(() => {
    localStorage.setItem('savedSections', JSON.stringify(sections));
  }, [sections]);

  useEffect(() => {
    if (localStorage.getItem('darkMode') === 'true') {
      document.body.classList.add('dark-mode');
    }
  }, []);

  // Fetch registered student accounts for the picker
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && !isStudent) {
      fetch(`${API}/auth/registered-students`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => res.ok ? res.json() : null)
        .catch(() => null)
        .then(data => {
          if (data && data.users) {
            setRegisteredStudents(data.users);
          }
        });
    }
  }, [isStudent]);

  // For students: filter sections to only those containing them (by email match)
  const visibleSections = isStudent
    ? sections.filter(s => s.students.some(st => st.email.toLowerCase() === user.email.toLowerCase()))
    : sections;

  const totalStudents = visibleSections.reduce((acc, s) => acc + s.students.length, 0);
  const totalSubmissions = visibleSections.reduce((acc, s) => acc + s.students.reduce((a, st) => a + st.submissions, 0), 0);

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

  function addStudentFromPicker() {
    if (!selectedRegisteredStudent || !addStudentSection) return;
    const student = registeredStudents.find(s => s.id === selectedRegisteredStudent);
    if (!student) return;
    const sectionId = parseInt(addStudentSection) || addStudentSection;
    const newStudent = {
      id: student.id,
      name: student.full_name || student.username,
      email: student.email,
      submissions: 0,
    };
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, students: [...s.students, newStudent] } : s
    ));
    setSelectedRegisteredStudent('');
    setAddStudentSection('');
    setShowAddStudent(false);
  }

  function deleteStudent(sectionId, studentId) {
    setSections(prev => prev.map(s =>
      s.id === sectionId
        ? { ...s, students: s.students.filter(st => st.id !== studentId) }
        : s
    ));
  }

  const displayedStudents = activeSection
    ? (visibleSections.find(s => s.id === activeSection)?.students || []).map(st => ({ ...st, sectionId: activeSection }))
    : visibleSections.flatMap(s => s.students.map(st => ({ ...st, sectionId: s.id })));

  return (
    <div className="students-layout">
      {/* Side Panel */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <Logo />
        </div>
        
        <nav className="sidebar-nav">
          <button className="nav-item" onClick={() => navigate('/dashboard')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></span>
            Dashboard
          </button>
          <button className="nav-item" onClick={() => navigate('/analyzer')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></span>
            Compiler Area
          </button>
          <button className="nav-item" onClick={() => navigate('/files')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>
            Files
          </button>
          <button className="nav-item active">
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span>
            {isStudent ? 'My Results' : 'Analysis Results'}
          </button>
          <button className="nav-item" onClick={() => navigate('/refactoring')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></span>
            Refactoring
          </button>
          <button className="nav-item" onClick={() => navigate('/history')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
            History
          </button>
          <button className="nav-item" onClick={() => navigate('/settings')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>
            Settings
          </button>
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item help-btn" onClick={() => setShowHelp(true)}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
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
            <h2 className="page-title">{isStudent ? 'My Results' : 'Analysis Results'}</h2>
            <p className="page-subtitle">
              {isStudent
                ? 'View your assigned section and submission results'
                : 'View results by section and manage student submissions'}
            </p>
          </div>
        </header>

        <div className="students-content">
          {/* Statistics Cards */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              </div>
              <div className="stat-info">
                <div className="stat-label">{isStudent ? 'My Sections' : 'Sections'}</div>
                <div className="stat-value">{visibleSections.length}</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
              </div>
              <div className="stat-info">
                <div className="stat-label">{isStudent ? 'Classmates' : 'Total Students'}</div>
                <div className="stat-value">{totalStudents}</div>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
              </div>
              <div className="stat-info">
                <div className="stat-label">Total Submissions</div>
                <div className="stat-value">{totalSubmissions}</div>
              </div>
            </div>
          </div>

          {/* Student Results (for student role) */}
          {isStudent && studentResults && (
            <section className="students-section" style={{ marginBottom: '24px' }}>
              <div className="section-header">
                <h3 className="section-title">My Analysis Results</h3>
              </div>
              <div className="table-container">
                <table className="students-table">
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Clone %</th>
                      <th>Complexity</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentResults.map((r, i) => (
                      <tr key={i}>
                        <td><span className="student-name">{r.fileName}</span></td>
                        <td><span className={`submission-badge ${r.clonePercentage > 30 ? 'warning' : ''}`}>{r.clonePercentage}%</span></td>
                        <td>{r.complexity || 'N/A'}</td>
                        <td><span className={`submission-badge ${r.clonePercentage > 30 ? 'warning' : 'success'}`}>
                          {r.clonePercentage > 30 ? 'Review' : 'Good'}
                        </span></td>
                        <td>{r.date || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Sections Filter */}
          <section className="sections-filter">
            <div className="section-header">
              <h3 className="section-title">{isStudent ? 'My Sections' : 'Sections'}</h3>
              {!isStudent && (
                <button className="action-btn primary" onClick={() => setShowAddSection(!showAddSection)}>
                  <span className="btn-icon"></span>
                  Add Section
                </button>
              )}
            </div>

            {!isStudent && showAddSection && (
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
                {isStudent ? 'All My Sections' : 'All Sections'}
              </button>
              {visibleSections.map(section => (
                <div key={section.id} className="section-tab-wrapper">
                  <button
                    className={`section-tab ${activeSection === section.id ? 'active' : ''}`}
                    onClick={() => setActiveSection(section.id)}
                  >
                    {section.name} ({section.students.length})
                  </button>
                  {!isStudent && (
                    <button className="section-delete-btn" onClick={() => deleteSection(section.id)}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Students Table Section */}
          <section className="students-section">
            <div className="section-header">
              <h3 className="section-title">
                {activeSection
                  ? visibleSections.find(s => s.id === activeSection)?.name || 'Students'
                  : isStudent ? 'All Classmates' : 'All Students'}
              </h3>
              {!isStudent && (
                <button className="action-btn primary" onClick={() => setShowAddStudent(!showAddStudent)}>
                  <span className="btn-icon"></span>
                  Add Student
                </button>
              )}
            </div>

            {!isStudent && showAddStudent && (
              <div className="add-student-form">
                {registeredStudents.length > 0 ? (
                  <>
                    <select
                      className="section-input section-select"
                      value={selectedRegisteredStudent}
                      onChange={(e) => setSelectedRegisteredStudent(e.target.value)}
                    >
                      <option value="">Select registered student...</option>
                      {registeredStudents.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.full_name || s.username} ({s.email})
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <div style={{ color: '#6b7280', fontSize: '13px', padding: '8px 0' }}>
                    No registered student accounts found. Students must register first.
                  </div>
                )}
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
                <button className="action-btn primary" onClick={addStudentFromPicker} disabled={!selectedRegisteredStudent || !addStudentSection}>
                  Add
                </button>
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
                    {!isStudent && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {displayedStudents.length === 0 ? (
                    <tr>
                      <td colSpan={isStudent ? "4" : "5"} style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                        {isStudent ? 'You have not been assigned to any section yet' : 'No students in this section yet'}
                      </td>
                    </tr>
                  ) : (
                    displayedStudents.map((student) => (
                      <tr key={student.id}>
                        <td>
                          <span className="student-id">#{typeof student.id === 'string' ? student.id.slice(0, 6) : student.id}</span>
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
                        {!isStudent && (
                          <td>
                            <div className="action-buttons">
                              <button className="icon-btn view">
                                <span></span>
                              </button>
                              <button className="icon-btn delete" onClick={() => deleteStudent(student.sectionId, student.id)}>
                                <span></span>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      {showHelp && (
        <div className="help-modal-overlay" onClick={() => setShowHelp(false)}>
          <div className="help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="help-modal-header">
              <h3>Help & Documentation</h3>
              <button className="help-close-btn" onClick={() => setShowHelp(false)}>✕</button>
            </div>
            <div className="help-modal-body">
              <div className="help-section">
                <h4>Code Analyzer</h4>
                <p>Upload or paste code to detect duplicates. Supports Python and Java. Use the Analyze button to get clone detection results with visual metrics.</p>
              </div>
              <div className="help-section">
                <h4>Files</h4>
                <p>Upload and manage your code files (.zip, .txt, .java, .py). You can scan any uploaded file for code clones directly from the Files page.</p>
              </div>
              <div className="help-section">
                <h4>Analysis Results</h4>
                <p>View and manage students organized by sections. Add students to sections and track their submissions.</p>
              </div>
              <div className="help-section">
                <h4>Refactoring</h4>
                <p>Get refactoring suggestions for your code. Detect code smells and see before/after comparisons.</p>
              </div>
              <div className="help-section">
                <h4>History</h4>
                <p>Track all your activities including analyses, uploads, and refactoring operations in real-time.</p>
              </div>
              <div className="help-section">
                <h4>Settings</h4>
                <p>Configure dark mode, notification preferences, and update your account information.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Students;
