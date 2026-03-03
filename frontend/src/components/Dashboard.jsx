import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from './Logo';
import './Dashboard.css';

import API from '../api';

function Dashboard() {
  const [user, setUser] = useState(() => {
    const userStr = localStorage.getItem('user');
    try { return userStr ? JSON.parse(userStr) : null; } catch { return null; }
  });
  const [showHelp, setShowHelp] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 1, text: 'System updated to latest version', time: '2 hours ago', read: false },
    { id: 2, text: 'New analysis features available', time: '1 day ago', read: false },
    { id: 3, text: 'Weekly report is ready', time: '3 days ago', read: true },
  ]);
  const [stats, setStats] = useState({
    totalFiles: 0,
    totalHistory: 0,
    activeProjects: 0,
  });
  const [analysisStats, setAnalysisStats] = useState({
    analyses: [],
    avgClonePercentage: 0,
    avgComplexity: 0,
    avgMaintainability: 0,
    totalClones: 0,
  });
  const profilePic = user ? localStorage.getItem('profilePicture_' + user.id) : null;
  const navigate = useNavigate();

  const handleMarkAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleNotificationClick = (id) => {
    setNotifications(prev => prev.map(x => x.id === id ? { ...x, read: true } : x));
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (!token || !userStr) {
      navigate('/login');
      return;
    }

    const fetchUserData = () => {
      fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (res.status === 401 || res.status === 422) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            navigate('/login');
            return null;
          }
          if (!res.ok) return null;
          return res.json();
        })
        .then((data) => {
          if (data && data.user) {
            setUser(data.user);
            localStorage.setItem('user', JSON.stringify(data.user));
          }
        })
        .catch(() => {});
    };

    const fetchStats = () => {
      // Fetch files count
      fetch(`${API}/auth/files`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data && data.files) {
            setStats((prev) => ({ ...prev, totalFiles: data.files.length }));
          }
        })
        .catch(() => {});

      // Fetch history count
      fetch(`${API}/auth/activity`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data && data.history) {
            setStats((prev) => ({ ...prev, totalHistory: data.history.length }));
          }
        })
        .catch(() => {});

      // Fetch analysis history for TAHD analytics
      fetch(`${API}/auth/history?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data && data.analyses && data.analyses.length > 0) {
            const analyses = data.analyses;
            const avgClone = Math.round(analyses.reduce((s, a) => s + (a.clone_percentage || 0), 0) / analyses.length);
            const avgComplexity = Math.round(analyses.reduce((s, a) => s + (a.cyclomatic_complexity || 0), 0) / analyses.length * 10) / 10;
            const avgMaint = Math.round(analyses.reduce((s, a) => s + (a.maintainability_index || 0), 0) / analyses.length);
            setAnalysisStats({
              analyses,
              avgClonePercentage: avgClone,
              avgComplexity: avgComplexity,
              avgMaintainability: avgMaint,
              totalClones: analyses.reduce((s, a) => s + (a.clone_percentage > 0 ? 1 : 0), 0),
            });
          }
        })
        .catch(() => {});
    };

    fetchUserData();
    fetchStats();

    // Poll for updates every 10 seconds
    const interval = setInterval(() => {
      fetchUserData();
      fetchStats();
    }, 10000);

    return () => clearInterval(interval);
  }, [navigate]);

  useEffect(() => {
    if (localStorage.getItem('lightMode') === 'true') {
      document.body.classList.add('light-mode');
    }
  }, []);

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

  if (!user) {
    return (
      <div className="dashboard-layout">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      {/* Mobile sidebar overlay */}
      <div className={`sidebar-overlay ${sidebarOpen ? 'sidebar-overlay-visible' : ''}`} onClick={() => setSidebarOpen(false)} />
      {/* Side Panel */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <Logo />
        </div>
        
        <nav className="sidebar-nav">
          <button className="nav-item active" onClick={() => setSidebarOpen(false)}>
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
          <button className="nav-item" onClick={() => { setSidebarOpen(false); navigate('/analysis-results'); }}>
              <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span>
              {user.role === 'student' ? 'My Results' : 'Analysis Results'}
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
              {profilePic ? (
                <img src={profilePic} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
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

      {/* Main Content */}
      <main className="main-content">
        <header className="dashboard-header">
          <div className="header-left">
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div>
              <h2 className="page-title">{user.role === 'student' ? 'My Dashboard' : 'Instructor Dashboard'}</h2>
              <p className="page-subtitle">{user.role === 'student' ? 'Track your submissions and analysis results' : 'Monitor student submissions, code quality, and clone detection analytics'}</p>
            </div>
          </div>
          <div className="header-right" style={{ position: 'relative' }}>
            <button className="notification-btn" onClick={() => setShowNotifications(!showNotifications)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="notification-badge">{notifications.filter(n => !n.read).length}</span>
              )}
            </button>
            {showNotifications && (
              <div className="notification-dropdown">
                <div className="notification-dropdown-header">
                  <span className="notification-dropdown-title">Notifications</span>
                  <button className="notification-mark-read" onClick={handleMarkAllRead}>Mark all read</button>
                </div>
                <div className="notification-list">
                  {notifications.length === 0 ? (
                    <div className="notification-empty">No notifications</div>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className={`notification-item ${n.read ? 'read' : 'unread'}`} onClick={() => handleNotificationClick(n.id)}>
                        <div className="notification-text">{n.text}</div>
                        <div className="notification-time">{n.time}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="dashboard-content">
          <div className="welcome-section">
            <h3 className="welcome-title">Welcome back{user.role ? `, ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}` : ''} {user.full_name || user.username}!</h3>
            <p className="welcome-text">{user.role === 'student' ? "Here's an overview of your submissions and results" : "Here's an overview of your class analytics and code quality metrics"}</p>
          </div>

          {/* Stats Grid */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div>
              <div className="stat-info">
                <div className="stat-label">Total Analyses</div>
                <div className="stat-value">{analysisStats.analyses.length || user.total_analyses || 0}</div>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>
              <div className="stat-info">
                <div className="stat-label">Total Files</div>
                <div className="stat-value">{stats.totalFiles}</div>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
              <div className="stat-info">
                <div className="stat-label">Activities</div>
                <div className="stat-value">{stats.totalHistory}</div>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>
              <div className="stat-info">
                <div className="stat-label">Active Projects</div>
                <div className="stat-value">{stats.activeProjects}</div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="quick-actions">
            <h4 className="section-title">{user.role === 'student' ? 'Quick Actions' : 'Instructor Actions'}</h4>
            <div className="action-buttons">
              <button className="action-card" onClick={() => navigate('/analyzer')}>
                <div className="action-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></div>
                <div className="action-content">
                  <div className="action-title">Code Analyzer</div>
                  <div className="action-desc">{user.role === 'student' ? 'Analyze your code for duplicates' : 'Run clone detection on student submissions'}</div>
                </div>
                <div className="action-arrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></div>
              </button>
              
              {user.role === 'student' ? (
                <button className="action-card" onClick={() => navigate('/files')}>
                  <div className="action-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
                  <div className="action-content">
                    <div className="action-title">My Submissions</div>
                    <div className="action-desc">View your submitted files</div>
                  </div>
                  <div className="action-arrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></div>
                </button>
              ) : (
                <button className="action-card" onClick={() => navigate('/students')}>
                  <div className="action-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
                  <div className="action-content">
                    <div className="action-title">View Students</div>
                    <div className="action-desc">Manage student submissions</div>
                  </div>
                  <div className="action-arrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></div>
                </button>
              )}
              
              <button className="action-card" onClick={() => navigate('/history')}>
                <div className="action-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
                <div className="action-content">
                  <div className="action-title">Reports</div>
                  <div className="action-desc">View analysis reports</div>
                </div>
                <div className="action-arrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></div>
              </button>

              {user.role === 'admin' && (
                <button className="action-card" onClick={() => navigate('/admin')}>
                  <div className="action-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
                  <div className="action-content">
                    <div className="action-title">Admin Panel</div>
                    <div className="action-desc">Manage users and system settings</div>
                  </div>
                  <div className="action-arrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></div>
                </button>
              )}
            </div>
          </div>

          {/* TAHD Code Quality Analytics - visible for all users */}
          <div className="account-section">
              <h4 className="section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle',marginRight:'8px'}}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                Code Quality Analytics
              </h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '16px' }}>Powered by TAHD — Token-AST-Halstead Detection pipeline</p>
              
              {/* TAHD Metrics Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Avg Clone %</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700, color: analysisStats.avgClonePercentage > 50 ? '#ef4444' : analysisStats.avgClonePercentage > 25 ? '#f59e0b' : '#22c55e' }}>{analysisStats.avgClonePercentage}%</div>
                </div>
                <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Avg Complexity</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700, color: analysisStats.avgComplexity > 10 ? '#ef4444' : analysisStats.avgComplexity > 5 ? '#f59e0b' : '#22c55e' }}>{analysisStats.avgComplexity}</div>
                </div>
                <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Avg Maintainability</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700, color: analysisStats.avgMaintainability >= 65 ? '#22c55e' : analysisStats.avgMaintainability >= 35 ? '#f59e0b' : '#ef4444' }}>{analysisStats.avgMaintainability}</div>
                </div>
                <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Flagged Submissions</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700, color: analysisStats.totalClones > 0 ? '#ef4444' : '#22c55e' }}>{analysisStats.totalClones}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                {/* Sections Chart */}
                <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)' }}>
                  <h5 style={{ color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '16px' }}>Students per Section</h5>
                  {(() => {
                    try {
                      const savedSections = JSON.parse(localStorage.getItem('savedSections') || '[]');
                      if (savedSections.length === 0) return <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No sections yet. Go to Students to create sections.</p>;
                      const maxStudents = Math.max(...savedSections.map(s => (s.students || []).length), 1);
                      return savedSections.map(sec => (
                        <div key={sec.id || sec.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                          <span style={{ minWidth: '80px', fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'right' }}>{sec.name}</span>
                          <div style={{ flex: 1, height: '24px', background: 'var(--bg-secondary)', borderRadius: '6px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${((sec.students || []).length / maxStudents) * 100}%`, background: 'var(--accent-color, #6366f1)', borderRadius: '6px', minWidth: (sec.students || []).length > 0 ? '20px' : '0', transition: 'width 0.3s ease' }} />
                          </div>
                          <span style={{ minWidth: '24px', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>{(sec.students || []).length}</span>
                        </div>
                      ));
                    } catch { return <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Unable to load sections</p>; }
                  })()}
                </div>

                {/* Recent Analyses - TAHD powered */}
                <div style={{ background: 'var(--bg-card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h5 style={{ color: 'var(--text-primary)', fontSize: '0.9rem', margin: 0 }}>Recent Analyses</h5>
                    {analysisStats.analyses.length > 0 && (
                      <button onClick={() => navigate('/analysis-results')} aria-label="View all analyses" style={{ background: 'none', border: 'none', color: 'var(--accent-color, #6366f1)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', padding: '2px 6px' }}>View All →</button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {analysisStats.analyses.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No analyses yet. Use the Code Analyzer to scan submissions.</p>
                    ) : (
                      analysisStats.analyses.slice(0, 5).map((a, i) => (
                        <div key={a.id || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 4 ? '1px solid var(--border-color)' : 'none' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>{a.language?.toUpperCase()} analysis</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{a.created_at ? new Date(a.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''} · CC: {a.cyclomatic_complexity} · MI: {a.maintainability_index}</div>
                          </div>
                          <span style={{ padding: '2px 10px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 600, background: a.clone_percentage > 50 ? 'rgba(239,68,68,0.15)' : a.clone_percentage > 25 ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)', color: a.clone_percentage > 50 ? '#ef4444' : a.clone_percentage > 25 ? '#f59e0b' : '#22c55e', border: `1px solid ${a.clone_percentage > 50 ? 'rgba(239,68,68,0.3)' : a.clone_percentage > 25 ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'}` }}>{a.clone_percentage}%</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
          </div>

          {/* Account Details */}
          <div className="account-section">
            <h4 className="section-title">Account Details</h4>
            <div className="details-grid">
              <div className="detail-item">
                <span className="detail-label">Username</span>
                <span className="detail-value">{user.username}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Email</span>
                <span className="detail-value">{user.email}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Account Created</span>
                <span className="detail-value">
                  {user.created_at 
                    ? new Date(user.created_at).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })
                    : 'N/A'}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Account Status</span>
                <span className="detail-value status-active">Active</span>
              </div>
            </div>
          </div>
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

export default Dashboard;
