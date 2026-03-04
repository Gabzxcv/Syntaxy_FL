import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from './Logo';
import './Students.css';

import API from '../api';

function generateSimilarityPairs(results) {
  if (!results || results.length < 2) {
    return [];
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
        const similarity = Math.max(0, Math.min(100, Math.round(base)));

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

  return pairs;
}

function AnalysisResults() {
  const navigate = useNavigate();
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : { username: 'User', email: 'user@email.com', full_name: 'User' };

  const [showHelp, setShowHelp] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profilePicture] = useState(() =>
    localStorage.getItem('profilePicture_' + user.id) || ''
  );

  const [analysisHistory, setAnalysisHistory] = useState([]);

  useEffect(() => {
    function loadData() {
      // Fetch TAHD analysis history from backend (includes file_name, section_name)
      const token = localStorage.getItem('token');
      if (token) {
        fetch(`${API}/auth/history?limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((res) => res.ok ? res.json() : null)
          .then((data) => {
            if (data && data.analyses) {
              setAnalysisHistory(data.analyses);
            }
          })
          .catch(() => {});
      }
    }

    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  // Build results from backend analysis history
  const results = analysisHistory.map(a => ({
    fileName: a.file_name || `analysis-${a.id.slice(0, 8)}`,
    studentName: a.file_name || 'Unknown',
    studentEmail: a.file_name || '',
    section: a.section_name || 'Unassigned',
    clonePercentage: a.clone_percentage || 0,
    complexity: a.cyclomatic_complexity || 0,
    maintainability: a.maintainability_index || 0,
    date: a.created_at,
  }));

  const similarityPairs = generateSimilarityPairs(results);

  const avgClone = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + (r.clonePercentage || 0), 0) / results.length)
    : 0;

  const highSimilarityCount = similarityPairs.filter(p => p.status === 'high').length;

  // TAHD metrics from analysis history
  const avgComplexity = analysisHistory.length > 0
    ? Math.round(analysisHistory.reduce((s, a) => s + (a.cyclomatic_complexity || 0), 0) / analysisHistory.length * 10) / 10
    : 0;
  const avgMaintainability = analysisHistory.length > 0
    ? Math.round(analysisHistory.reduce((s, a) => s + (a.maintainability_index || 0), 0) / analysisHistory.length)
    : 0;

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
      fetch(`${API}/auth/logout`, {
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
      <div className={`sidebar-overlay ${sidebarOpen ? 'sidebar-overlay-visible' : ''}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <Logo />
        </div>

        <nav className="sidebar-nav">
          <button className="nav-item" onClick={() => { setSidebarOpen(false); navigate('/dashboard'); }}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></span>
            Dashboard
          </button>
          <button className="nav-item" onClick={() => { setSidebarOpen(false); navigate('/analyzer'); }}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></span>
            Code Analyzer
          </button>
          <button className="nav-item" onClick={() => { setSidebarOpen(false); navigate('/files'); }}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>
            Files
          </button>
          <button className="nav-item active" onClick={() => setSidebarOpen(false)}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span>
            Analysis Results
          </button>
          <button className="nav-item" onClick={() => { setSidebarOpen(false); navigate('/students'); }}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
            Students
          </button>
          <button className="nav-item" onClick={() => { setSidebarOpen(false); navigate('/refactoring'); }}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></span>
            Refactoring
          </button>
          <button className="nav-item" onClick={() => { setSidebarOpen(false); navigate('/history'); }}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
            History
          </button>
          <button className="nav-item" onClick={() => { setSidebarOpen(false); navigate('/settings'); }}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>
            Settings
          </button>
          <button className="nav-item" onClick={() => { setSidebarOpen(false); navigate('/chat'); }}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
            Chat
          </button>
          {user.role === 'admin' && (
            <button className="nav-item" onClick={() => { setSidebarOpen(false); navigate('/admin'); }}>
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
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div>
              <h2 className="page-title">Analysis Results</h2>
              <p className="page-subtitle">Code clone detection and similarity analysis results</p>
            </div>
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
                <div className="stat-value">{results.length || analysisHistory.length}</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
              </div>
              <div className="stat-info">
                <div className="stat-label">Avg Clone %</div>
                <div className="stat-value">{avgClone || (analysisHistory.length > 0 ? Math.round(analysisHistory.reduce((s, a) => s + (a.clone_percentage || 0), 0) / analysisHistory.length) : 0)}%</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <div className="stat-info">
                <div className="stat-label">High Similarity</div>
                <div className="stat-value">{highSimilarityCount || analysisHistory.filter(a => (a.clone_percentage || 0) > 50).length}</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              </div>
              <div className="stat-info">
                <div className="stat-label">Avg Complexity</div>
                <div className="stat-value">{avgComplexity}</div>
              </div>
            </div>
          </div>

          {/* TAHD Detection Method Info */}
          <section className="settings-section" style={{ marginBottom: '24px' }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '16px 20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color, #6366f1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Detection Method: <strong style={{ color: 'var(--text-primary)' }}>TAHD v1.0</strong> — Token-AST-Halstead hybrid detection (fusion: 0.30×token + 0.40×AST + 0.30×Halstead). Avg Maintainability: <strong style={{ color: avgMaintainability >= 65 ? '#22c55e' : avgMaintainability >= 35 ? '#f59e0b' : '#ef4444' }}>{avgMaintainability}</strong>
              </span>
            </div>
          </section>

          {/* TAHD Analysis History Table */}
          {analysisHistory.length > 0 && (
            <section className="settings-section">
              <h3 className="section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle',marginRight:'8px'}}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                Analysis History
              </h3>

              <div style={{ overflowX: 'auto' }}>
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>Language</th>
                      <th>Clone %</th>
                      <th>Complexity</th>
                      <th>Maintainability</th>
                      <th>Execution</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysisHistory.map((a, i) => (
                      <tr key={a.id || i}>
                        <td style={{ textTransform: 'capitalize' }}>{a.language || '-'}</td>
                        <td>
                          <span className={`badge ${cloneColor(a.clone_percentage)}`}>
                            {a.clone_percentage}%
                          </span>
                        </td>
                        <td>{a.cyclomatic_complexity != null ? a.cyclomatic_complexity : '-'}</td>
                        <td>
                          <span style={{ color: (a.maintainability_index || 0) >= 65 ? '#22c55e' : (a.maintainability_index || 0) >= 35 ? '#f59e0b' : '#ef4444', fontWeight: 600 }}>
                            {a.maintainability_index != null ? a.maintainability_index : '-'}
                          </span>
                        </td>
                        <td>{a.execution_time_ms != null ? `${a.execution_time_ms}ms` : '-'}</td>
                        <td>{a.created_at ? new Date(a.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Analysis Results Table */}
          <section className="settings-section">
            <h3 className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle',marginRight:'8px'}}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              Student Analysis Results
            </h3>

            {results.length === 0 ? (
              <div className="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                <p>No student analysis results found. Results will appear here when students submit code for analysis.</p>
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
          {similarityPairs.length > 0 && (
            <section className="settings-section">
              <h3 className="section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle',marginRight:'8px'}}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                Code Similarity Matrix
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
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
          )}

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
                <h4>TAHD Analysis</h4>
                <p>Results are powered by the TAHD (Token-AST-Halstead Detection) pipeline, which uses three layers of analysis: token-based Jaccard similarity, AST structural comparison, and Halstead complexity fingerprinting.</p>
              </div>
              <div className="help-section">
                <h4>Analysis Results</h4>
                <p>View all code analysis results. The table shows clone percentages, cyclomatic complexity, and maintainability index calculated by the TAHD engine.</p>
              </div>
              <div className="help-section">
                <h4>Code Similarity Matrix</h4>
                <p>The similarity matrix compares code submissions between students within the same section. High similarity (above 70%) is flagged in red, medium (above 40%) in orange, and low similarity in green.</p>
              </div>
              <div className="help-section">
                <h4>Understanding Metrics</h4>
                <p>Clone percentage indicates code duplication. Cyclomatic complexity measures code branching. Maintainability index (0-100) rates how easy code is to maintain — higher is better.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AnalysisResults;
