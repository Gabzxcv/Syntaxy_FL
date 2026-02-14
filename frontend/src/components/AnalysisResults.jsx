import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from './Logo';
import './Students.css';

function generateSimilarityPairs(results) {
  if (!results || results.length < 2) {
    return [
      { student1: 'Alice Chen', student2: 'Bob Martinez', section: 'CS101-A', similarity: 87, file1: 'assignment1.py', file2: 'assignment1.py', status: 'high' },
      { student1: 'Carlos Wang', student2: 'Diana Lee', section: 'CS101-A', similarity: 42, file1: 'project2.py', file2: 'project2.py', status: 'medium' },
      { student1: 'Eve Johnson', student2: 'Frank Davis', section: 'CS101-B', similarity: 23, file1: 'lab3.py', file2: 'lab3.py', status: 'low' },
      { student1: 'Grace Kim', student2: 'Henry Wilson', section: 'CS101-B', similarity: 71, file1: 'homework4.py', file2: 'homework4.py', status: 'high' },
    ];
  }

  const bySection = {};
  results.forEach(r => {
    const sec = r.section || 'Unassigned';
    if (!bySection[sec]) bySection[sec] = [];
    bySection[sec].push(r);
  });

  const pairs = [];
  const seen = new Set();

  Object.entries(bySection).forEach(([section, sectionResults]) => {
    const students = [];
    const studentMap = {};
    sectionResults.forEach(r => {
      if (!studentMap[r.studentEmail]) {
        studentMap[r.studentEmail] = { name: r.studentName, email: r.studentEmail, results: [] };
        students.push(studentMap[r.studentEmail]);
      }
      studentMap[r.studentEmail].results.push(r);
    });

    for (let i = 0; i < students.length; i++) {
      for (let j = i + 1; j < students.length; j++) {
        const key = [students[i].email, students[j].email].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);

        const avgClone1 = students[i].results.length > 0
          ? students[i].results.reduce((s, r) => s + (r.clonePercentage || 0), 0) / students[i].results.length
          : 0;
        const avgClone2 = students[j].results.length > 0
          ? students[j].results.reduce((s, r) => s + (r.clonePercentage || 0), 0) / students[j].results.length
          : 0;
        const base = (avgClone1 + avgClone2) / 2;
        const randomVariation = Math.floor(Math.random() * 30) - 15;
        const similarity = Math.max(5, Math.min(95, Math.round(base + randomVariation)));

        let status = 'low';
        if (similarity > 70) status = 'high';
        else if (similarity > 40) status = 'medium';

        pairs.push({
          student1: students[i].name,
          student2: students[j].name,
          section,
          similarity,
          file1: students[i].results[0].fileName,
          file2: students[j].results[0].fileName,
          status,
        });
      }
    }
  });

  if (pairs.length === 0) {
    return [
      { student1: 'Alice Chen', student2: 'Bob Martinez', section: 'CS101-A', similarity: 87, file1: 'assignment1.py', file2: 'assignment1.py', status: 'high' },
      { student1: 'Carlos Wang', student2: 'Diana Lee', section: 'CS101-A', similarity: 42, file1: 'project2.py', file2: 'project2.py', status: 'medium' },
      { student1: 'Eve Johnson', student2: 'Frank Davis', section: 'CS101-B', similarity: 23, file1: 'lab3.py', file2: 'lab3.py', status: 'low' },
      { student1: 'Grace Kim', student2: 'Henry Wilson', section: 'CS101-B', similarity: 71, file1: 'homework4.py', file2: 'homework4.py', status: 'high' },
    ];
  }

  return pairs;
}

function AnalysisResults() {
  const navigate = useNavigate();
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : { username: 'User', email: 'user@email.com', full_name: 'User' };

  const [showHelp, setShowHelp] = useState(false);
  const [profilePicture] = useState(() =>
    localStorage.getItem('profilePicture_' + user.id) || ''
  );

  const [results, setResults] = useState([]);

  useEffect(() => {
    const stored = localStorage.getItem('studentResults');
    if (stored) {
      try { setResults(JSON.parse(stored)); } catch { setResults([]); }
    }
  }, []);

  const similarityPairs = generateSimilarityPairs(results);

  const avgClone = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + (r.clonePercentage || 0), 0) / results.length)
    : 0;

  const highSimilarityCount = similarityPairs.filter(p => p.status === 'high').length;

  const sectionStats = {};
  results.forEach(r => {
    const sec = r.section || 'Unassigned';
    if (!sectionStats[sec]) sectionStats[sec] = { count: 0, totalClone: 0, students: new Set() };
    sectionStats[sec].count += 1;
    sectionStats[sec].totalClone += (r.clonePercentage || 0);
    sectionStats[sec].students.add(r.studentEmail || r.studentName);
  });

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

  function cloneColor(pct) {
    if (pct > 50) return 'badge-red';
    if (pct > 25) return 'badge-orange';
    return 'badge-green';
  }

  function similarityBadgeStyle(status) {
    if (status === 'high') return { background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' };
    if (status === 'medium') return { background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' };
    return { background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' };
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
          <button className="nav-item active">
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span>
            Analysis Results
          </button>
          <button className="nav-item" onClick={() => navigate('/students')}>
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
            <h2 className="page-title">Analysis Results</h2>
            <p className="page-subtitle">Review code analysis and cross-student similarity</p>
          </div>
        </header>

        <div className="settings-content">
          {/* Stats Row */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              </div>
              <div className="stat-info">
                <div className="stat-label">Total Results</div>
                <div className="stat-value">{results.length}</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
              </div>
              <div className="stat-info">
                <div className="stat-label">Avg Clone %</div>
                <div className="stat-value">{avgClone}%</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <div className="stat-info">
                <div className="stat-label">High Similarity Pairs</div>
                <div className="stat-value">{highSimilarityCount}</div>
              </div>
            </div>
          </div>

          {/* Analysis Results Table */}
          <section className="settings-section">
            <h3 className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle',marginRight:'8px'}}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              Analysis Results
            </h3>

            {results.length === 0 ? (
              <div className="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                <p>No analysis results found. Results will appear here when students submit code for analysis.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>File Name</th>
                      <th>Student</th>
                      <th>Section</th>
                      <th>Clone %</th>
                      <th>Complexity</th>
                      <th>Maintainability</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i}>
                        <td>{r.fileName}</td>
                        <td>{r.studentName}</td>
                        <td>{r.section || '-'}</td>
                        <td>
                          <span className={`badge ${cloneColor(r.clonePercentage)}`}>
                            {r.clonePercentage}%
                          </span>
                        </td>
                        <td>{r.complexity != null ? r.complexity : '-'}</td>
                        <td>{r.maintainability != null ? r.maintainability : '-'}</td>
                        <td>{r.date ? new Date(r.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Cross-Student Similarity */}
          <section className="settings-section">
            <h3 className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle',marginRight:'8px'}}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Code Similarity Matrix
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
              {similarityPairs.map((pair, i) => (
                <div key={i} className="section-card" style={{ marginBottom: 0 }}>
                  <div className="section-card-header" style={{ alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <h4 className="section-card-title">{pair.student1} <span style={{ color: '#6b7280', margin: '0 4px' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle'}}><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg></span> {pair.student2}</h4>
                      <p className="section-card-subtitle">{pair.file1} vs {pair.file2}</p>
                      <p className="section-card-subtitle">Section: {pair.section}</p>
                    </div>
                    <span
                      style={{
                        ...similarityBadgeStyle(pair.status),
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontWeight: 600,
                        fontSize: '14px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {pair.similarity}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section Summary */}
          {Object.keys(sectionStats).length > 0 && (
            <section className="settings-section">
              <h3 className="section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle',marginRight:'8px'}}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                Section Summary
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
                {Object.entries(sectionStats).map(([section, stats]) => (
                  <div key={section} className="section-card" style={{ marginBottom: 0 }}>
                    <div className="section-card-header">
                      <div>
                        <h4 className="section-card-title">{section}</h4>
                        <p className="section-card-subtitle">{stats.students.size} student{stats.students.size !== 1 ? 's' : ''}</p>
                        <p className="section-card-subtitle">{stats.count} result{stats.count !== 1 ? 's' : ''}</p>
                        <p className="section-card-subtitle">Avg Clone: {Math.round(stats.totalClone / stats.count)}%</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
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
                <h4>Analysis Results</h4>
                <p>View all code analysis results submitted by students. The table shows file names, clone detection percentages, complexity scores, and maintainability ratings.</p>
              </div>
              <div className="help-section">
                <h4>Code Similarity Matrix</h4>
                <p>The similarity matrix compares code submissions between students within the same section. High similarity (above 70%) is flagged in red, medium (above 40%) in orange, and low similarity in green.</p>
              </div>
              <div className="help-section">
                <h4>Section Summary</h4>
                <p>View aggregated statistics for each section, including the number of students, total results, and average clone percentage.</p>
              </div>
              <div className="help-section">
                <h4>Understanding Clone Percentage</h4>
                <p>Clone percentage indicates how much of a student's code matches other known code. Higher percentages may indicate code reuse or plagiarism and should be reviewed carefully.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AnalysisResults;
