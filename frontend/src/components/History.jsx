import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from './Logo';
import './History.css';

const API = 'http://localhost:5000/api/v1';

const DEFAULT_HISTORY_DATA = [
  { id: 1, type: 'analysis', icon: '', description: 'Analyzed Python code - 15.3% clone detected', time: '2024-12-01T10:00:00Z', status: 'success' },
  { id: 2, type: 'upload', icon: '', description: 'Uploaded batch: project_files.zip - 5 files processed', time: '2024-12-01T09:00:00Z', status: 'success' },
  { id: 3, type: 'refactoring', icon: '', description: 'Refactored Java code - 3 code smells fixed', time: '2024-12-01T07:00:00Z', status: 'success' },
  { id: 4, type: 'analysis', icon: '', description: 'Analyzed JavaScript code - 42.7% clone detected', time: '2024-11-30T12:00:00Z', status: 'warning' },
  { id: 5, type: 'upload', icon: '', description: 'Uploaded file: utils.py - 1 file processed', time: '2024-11-30T08:00:00Z', status: 'success' },
  { id: 6, type: 'analysis', icon: '', description: 'Analyzed C++ code - 8.1% clone detected', time: '2024-11-29T14:00:00Z', status: 'success' },
  { id: 7, type: 'refactoring', icon: '', description: 'Refactored Python code - 5 duplicates removed', time: '2024-11-28T16:00:00Z', status: 'info' },
  { id: 8, type: 'upload', icon: '', description: 'Uploaded batch: homework_set3.zip - 12 files processed', time: '2024-11-27T11:00:00Z', status: 'success' },
  { id: 9, type: 'analysis', icon: '', description: 'Analyzed Java code - 27.5% clone detected', time: '2024-11-26T09:00:00Z', status: 'warning' },
  { id: 10, type: 'refactoring', icon: '', description: 'Refactored JavaScript code - 2 functions consolidated', time: '2024-11-20T10:00:00Z', status: 'info' },
];

function formatRelativeTime(isoString) {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  if (diffDay < 14) return '1 week ago';
  return `${Math.floor(diffDay / 7)} weeks ago`;
}

function computeStats(data, now) {
  const totalActivities = data.length;
  const thisWeek = data.filter((h) => {
    const diffDays = (now - new Date(h.time).getTime()) / (1000 * 60 * 60 * 24);
    return diffDays < 7;
  }).length;
  const today = data.filter((h) => {
    const diffHours = (now - new Date(h.time).getTime()) / (1000 * 60 * 60);
    return diffHours < 24;
  }).length;
  return { totalActivities, thisWeek, today };
}

function formatHistoryEntry(h) {
  return {
    id: h.id,
    type: h.entry_type,
    icon: '',
    description: h.description,
    time: h.created_at,
    status: h.status || 'success',
  };
}

function History() {
  const [filter, setFilter] = useState('all');
  const [showHelp, setShowHelp] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : { username: 'User', email: 'user@email.com', full_name: 'User' };
  const profilePic = user ? localStorage.getItem('profilePicture_' + user.id) : null;
  const isStudent = user.role === 'student';

  const userId = user.id || user.username || 'default';
  const historyKey = `activityHistory_${userId}`;

  const [historyData, setHistoryData] = useState(() => {
    const stored = localStorage.getItem(historyKey);
    if (stored) {
      try { return JSON.parse(stored); } catch { /* ignore */ }
    }
    // Migrate old global history if it exists
    const oldGlobal = localStorage.getItem('activityHistory');
    if (oldGlobal) {
      try {
        const parsed = JSON.parse(oldGlobal);
        localStorage.setItem(historyKey, JSON.stringify(parsed));
        return parsed;
      } catch { /* ignore */ }
    }
    return DEFAULT_HISTORY_DATA;
  });

  // Load history from backend on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    fetch(`${API}/auth/activity`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401 || res.status === 422) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          navigate('/login');
          return null;
        }
        if (!res.ok) throw new Error('Failed to fetch history');
        return res.json();
      })
      .then((data) => {
        if (data && data.history && data.history.length > 0) {
          // Convert backend history to frontend format
          const formattedHistory = data.history.map(formatHistoryEntry);
          setHistoryData(formattedHistory);
          localStorage.setItem(historyKey, JSON.stringify(formattedHistory));
        } else {
          // Use default if no history from backend
          localStorage.setItem(historyKey, JSON.stringify(DEFAULT_HISTORY_DATA));
        }
      })
      .catch((err) => {
        console.error('Error loading history:', err);
        // Keep using localStorage data
      })
      .finally(() => {
        setLoading(false);
      });
  }, [navigate, historyKey]);

  useEffect(() => {
    if (localStorage.getItem('darkMode') === 'true') {
      document.body.classList.add('dark-mode');
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

  const filtered = filter === 'all'
    ? historyData
    : historyData.filter((item) => item.type === filter);

  const [stats, setStats] = useState(() => {
    const ts = Date.now();
    return computeStats(historyData, ts);
  });

  // Update stats when history changes
  useEffect(() => {
    setStats(computeStats(historyData, Date.now()));
  }, [historyData]);

  useEffect(() => {
    const interval = setInterval(() => {
      const token = localStorage.getItem('token');
      if (!token) return;

      // Refresh history from backend
      fetch(`${API}/auth/activity`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) return null;
          return res.json();
        })
        .then((data) => {
          if (data && data.history && data.history.length > 0) {
            const formattedHistory = data.history.map(formatHistoryEntry);
            setHistoryData(formattedHistory);
            localStorage.setItem(historyKey, JSON.stringify(formattedHistory));
          }
        })
        .catch(() => {
          // Fallback to localStorage
          const stored = localStorage.getItem(historyKey);
          if (stored) {
            try {
              setHistoryData(JSON.parse(stored));
            } catch { /* ignore */ }
          }
        });
    }, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [historyKey]);

  const { totalActivities, thisWeek, today } = stats;

  return (
    <div className="history-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <Logo />
        </div>
        <nav className="sidebar-nav">
          <button className="nav-item" onClick={() => navigate('/dashboard')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></span> Dashboard
          </button>
          <button className="nav-item" onClick={() => navigate('/analyzer')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></span> Compiler Area
          </button>
          <button className="nav-item" onClick={() => navigate('/files')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span> Files
          </button>
          <button className="nav-item" onClick={() => navigate('/students')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span> Analysis Results
          </button>
          <button className="nav-item" onClick={() => navigate('/refactoring')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></span> Refactoring
          </button>
          <button className="nav-item active">
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span> History
          </button>
          <button className="nav-item" onClick={() => navigate('/settings')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span> Settings
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

      <main className="main-content">
        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner">Loading history...</div>
          </div>
        ) : (
          <>
            <header className="history-header">
              <div className="header-left">
                <h2 className="page-title">{isStudent ? 'My Activity' : 'Activity History'}</h2>
                <p className="page-subtitle">{isStudent ? 'Track your recent submissions and analyses' : 'Review your past analyses, uploads, and refactoring activities'}</p>
              </div>
            </header>

        <div className="history-content">
          {/* Stats Cards */}
          <div className="history-stats">
            <div className="stat-card">
              <div className="stat-icon"></div>
              <div className="stat-info">
                <div className="stat-value">{totalActivities}</div>
                <div className="stat-label">Total Activities</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
              <div className="stat-info">
                <div className="stat-value">{thisWeek}</div>
                <div className="stat-label">This Week</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"></div>
              <div className="stat-info">
                <div className="stat-value">{today}</div>
                <div className="stat-label">Today</div>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="history-filters">
            <button className={`filter-btn${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>All</button>
            <button className={`filter-btn${filter === 'analysis' ? ' active' : ''}`} onClick={() => setFilter('analysis')}>Analysis</button>
            <button className={`filter-btn${filter === 'upload' ? ' active' : ''}`} onClick={() => setFilter('upload')}>Uploads</button>
            <button className={`filter-btn${filter === 'refactoring' ? ' active' : ''}`} onClick={() => setFilter('refactoring')}>Refactoring</button>
          </div>

          {/* Timeline */}
          <div className="history-timeline">
            {filtered.map((item) => (
              <div className="timeline-item" key={item.id}>
                <div className="timeline-icon">{item.icon}</div>
                <div className="timeline-body">
                  <div className="timeline-description">{item.description}</div>
                  <div className="timeline-meta">
                    <span className="timeline-time">{formatRelativeTime(item.time)}</span>
                    <span className={`timeline-status ${item.status}`}>
                      {item.status === 'success' ? 'Success' : item.status === 'warning' ? 'Warning' : 'Info'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            </div>
          </div>
        </>
        )}
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

export default History;
