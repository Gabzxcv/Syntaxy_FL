import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from './Logo';
import './Students.css';

const REGISTERED_STUDENTS = [
  { name: 'Alice Chen', email: 'alice.chen@university.edu' },
  { name: 'Bob Martinez', email: 'bob.martinez@university.edu' },
  { name: 'Carlos Wang', email: 'carlos.wang@university.edu' },
  { name: 'Diana Lee', email: 'diana.lee@university.edu' },
  { name: 'Eve Johnson', email: 'eve.johnson@university.edu' },
  { name: 'Frank Davis', email: 'frank.davis@university.edu' },
  { name: 'Grace Kim', email: 'grace.kim@university.edu' },
  { name: 'Henry Wilson', email: 'henry.wilson@university.edu' },
];

const REGISTERED_INSTRUCTORS = [
  { name: 'Dr. Smith', email: 'smith@university.edu' },
  { name: 'Prof. Garcia', email: 'garcia@university.edu' },
  { name: 'Dr. Patel', email: 'patel@university.edu' },
];

function Students() {
  const navigate = useNavigate();
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : { username: 'User', email: 'user@email.com', full_name: 'User' };
  const isPrivileged = user.role === 'admin' || user.role === 'instructor';

  const [showHelp, setShowHelp] = useState(false);
  const [profilePicture] = useState(() =>
    localStorage.getItem('profilePicture_' + user.id) || ''
  );

  const [sections, setSections] = useState(() => {
    const saved = localStorage.getItem('savedSections');
    if (saved) {
      try { return JSON.parse(saved); } catch { return []; }
    }
    return [];
  });

  const [results, setResults] = useState([]);

  // Form state
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionInstructor, setNewSectionInstructor] = useState('');
  const [selectedStudentEmail, setSelectedStudentEmail] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('studentResults');
    if (stored) {
      try { setResults(JSON.parse(stored)); } catch { setResults([]); }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('savedSections', JSON.stringify(sections));
  }, [sections]);

  const totalStudents = sections.reduce((sum, s) => sum + s.students.length, 0);

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

  function handleCreateSection(e) {
    e.preventDefault();
    if (!newSectionName.trim() || !newSectionInstructor) return;
    const instructor = REGISTERED_INSTRUCTORS.find(i => i.email === newSectionInstructor);
    const section = {
      id: crypto.randomUUID(),
      name: newSectionName.trim(),
      instructor: instructor ? instructor.name : '',
      students: [],
    };
    setSections(prev => [...prev, section]);
    setNewSectionName('');
    setNewSectionInstructor('');
  }

  function handleAddStudent(e) {
    e.preventDefault();
    if (!selectedSectionId || !selectedStudentEmail) return;
    const registered = REGISTERED_STUDENTS.find(s => s.email === selectedStudentEmail);
    if (!registered) return;
    const section = sections.find(s => s.id === selectedSectionId);
    if (section && section.students.some(st => st.email === registered.email)) return;
    setSections(prev =>
      prev.map(s =>
        s.id === selectedSectionId
          ? { ...s, students: [...s.students, { name: registered.name, email: registered.email, submissions: 0 }] }
          : s
      )
    );
    setSelectedStudentEmail('');
  }

  function getAvailableStudents() {
    if (!selectedSectionId) return REGISTERED_STUDENTS;
    const section = sections.find(s => s.id === selectedSectionId);
    if (!section) return REGISTERED_STUDENTS;
    const existingEmails = new Set(section.students.map(st => st.email));
    return REGISTERED_STUDENTS.filter(s => !existingEmails.has(s.email));
  }

  function getStudentProfilePic(email) {
    return localStorage.getItem(`profilePicture_${email}`) || '';
  }

  function handleDeleteSection(id) {
    setSections(prev => prev.filter(s => s.id !== id));
  }

  function handleRemoveStudent(sectionId, studentEmail) {
    setSections(prev =>
      prev.map(s =>
        s.id === sectionId
          ? { ...s, students: s.students.filter(st => st.email !== studentEmail) }
          : s
      )
    );
  }

  function getResultsForStudent(email) {
    return results.filter(r => r.studentEmail === email);
  }

  return (
    <div className="settings-layout">
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
          <button className="nav-item" onClick={() => navigate('/analysis-results')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span>
            Analysis Results
          </button>
          <button className="nav-item active">
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
            Students
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
          <button className="nav-item" onClick={() => navigate('/chat')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
            Chat
          </button>
          {user.role === 'admin' && (
            <button className="nav-item" onClick={() => navigate('/admin')}>
              <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span>
              Admin
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item help-btn" onClick={() => setShowHelp(true)}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
            Help
          </button>
          <div className="user-profile">
            <div className="user-avatar">
              {profilePicture ? (
                <img src={profilePicture} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                (user.full_name || user.username).charAt(0).toUpperCase()
              )}
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

      <main className="main-content">
        <header className="settings-header">
          <div className="header-left">
            <h2 className="page-title">Students &amp; Sections</h2>
            <p className="page-subtitle">Manage sections and track student submissions</p>
          </div>
        </header>

        <div className="settings-content">
          {/* Stats Row */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div className="stat-info">
                <div className="stat-label">Total Sections</div>
                <div className="stat-value">{sections.length}</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <div className="stat-info">
                <div className="stat-label">Total Students</div>
                <div className="stat-value">{totalStudents}</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              </div>
              <div className="stat-info">
                <div className="stat-label">Total Results</div>
                <div className="stat-value">{results.length}</div>
              </div>
            </div>
          </div>

          {/* Create Section */}
          {isPrivileged && (
          <section className="settings-section">
            <h3 className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle',marginRight:'8px'}}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Create Section
            </h3>
            <form onSubmit={handleCreateSection}>
              <div className="form-row">
                <input
                  type="text"
                  className="setting-input"
                  placeholder="Section name"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                />
                <select
                  className="setting-select"
                  value={newSectionInstructor}
                  onChange={(e) => setNewSectionInstructor(e.target.value)}
                >
                  <option value="">Select instructor...</option>
                  {REGISTERED_INSTRUCTORS.map(i => (
                    <option key={i.email} value={i.email}>{i.name} ({i.email})</option>
                  ))}
                </select>
                <button type="submit" className="action-btn primary">Create</button>
              </div>
            </form>
          </section>
          )}

          {/* Add Student */}
          {isPrivileged && (
          <section className="settings-section">
            <h3 className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle',marginRight:'8px'}}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              Add Student to Section
            </h3>
            <form onSubmit={handleAddStudent}>
              <div className="form-row">
                <select
                  className="setting-select"
                  value={selectedSectionId}
                  onChange={(e) => setSelectedSectionId(e.target.value)}
                >
                  <option value="">Select section...</option>
                  {sections.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <select
                  className="setting-select"
                  value={selectedStudentEmail}
                  onChange={(e) => setSelectedStudentEmail(e.target.value)}
                >
                  <option value="">Select student...</option>
                  {getAvailableStudents().map(s => (
                    <option key={s.email} value={s.email}>{s.name} ({s.email})</option>
                  ))}
                </select>
                <button type="submit" className="action-btn primary">Add</button>
              </div>
            </form>
          </section>
          )}

          {/* Sections List */}
          <section className="settings-section">
            <h3 className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle',marginRight:'8px'}}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Sections &amp; Students
            </h3>

            {sections.length === 0 ? (
              <div className="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                <p>No sections created yet. Create a section above to get started.</p>
              </div>
            ) : (
              sections.map(section => (
                <div key={section.id} className="section-card">
                  <div className="section-card-header">
                    <div>
                      <h4 className="section-card-title">{section.name}</h4>
                      {section.instructor && <p className="section-card-subtitle">Instructor: {section.instructor}</p>}
                      <p className="section-card-subtitle">{section.students.length} student{section.students.length !== 1 ? 's' : ''}</p>
                    </div>
                    {isPrivileged && (
                    <button className="btn-sm btn-danger" onClick={() => handleDeleteSection(section.id)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle',marginRight:'4px'}}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      Delete
                    </button>
                    )}
                  </div>

                  {section.students.length === 0 ? (
                    <div className="empty-state" style={{ padding: '20px' }}>
                      <p>No students in this section yet.</p>
                    </div>
                  ) : (
                    <div className="student-list">
                      {section.students.map(student => {
                        const studentResults = getResultsForStudent(student.email);
                        const pic = getStudentProfilePic(student.email);
                        return (
                          <div key={student.email} className="student-item">
                            <div className="student-info-row">
                              <div className="student-avatar-sm">
                                {pic ? (
                                  <img src={pic} alt={student.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                                ) : (
                                  student.name.charAt(0).toUpperCase()
                                )}
                              </div>
                              <div className="student-detail">
                                <span className="name student-name-link" onClick={() => navigate(`/student-profile/${encodeURIComponent(student.email)}`)}>{student.name}</span>
                                <span className="email">{student.email}</span>
                              </div>
                              <span className="badge badge-purple">{studentResults.length} result{studentResults.length !== 1 ? 's' : ''}</span>
                            </div>
                            {isPrivileged && (
                            <button className="btn-sm btn-danger" onClick={() => handleRemoveStudent(section.id, student.email)}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle'}}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
          </section>
        </div>
      </main>

      {showHelp && (
        <div className="help-modal-overlay" onClick={() => setShowHelp(false)}>
          <div className="help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="help-modal-header">
              <h3>Help & Documentation</h3>
              <button className="help-close-btn" onClick={() => setShowHelp(false)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <div className="help-modal-body">
              <div className="help-section">
                <h4>Students &amp; Sections</h4>
                <p>Create sections, add students, and track their code analysis submissions. View clone detection percentages and submission history for each student.</p>
              </div>
              <div className="help-section">
                <h4>Creating Sections</h4>
                <p>Use the Create Section form to add a new section with a name and optional instructor. Sections help organize students into groups.</p>
              </div>
              <div className="help-section">
                <h4>Adding Students</h4>
                <p>Select a section from the dropdown, then enter the student name and email to add them. Students can be removed individually from their sections.</p>
              </div>
              <div className="help-section">
                <h4>Analysis Results</h4>
                <p>Results from code analysis are displayed in the table below. Each entry shows the file name, student, clone percentage, and submission date.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Students;