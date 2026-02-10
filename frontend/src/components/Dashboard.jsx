import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from './Logo';
import './Dashboard.css';

const API = 'http://localhost:5000/api/v1';

function Dashboard() {
  const [user, setUser] = useState(() => {
    const userStr = localStorage.getItem('user');
    try { return userStr ? JSON.parse(userStr) : null; } catch { return null; }
  });
  const [showHelp, setShowHelp] = useState(false);
  const [stats, setStats] = useState({
    totalFiles: 0,
    totalHistory: 0,
    activeProjects: 0,
  });
  const navigate = useNavigate();

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
      fetch(`${API}/auth/history`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data && data.history) {
            setStats((prev) => ({ ...prev, totalHistory: data.history.length }));
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

  if (!user) {
    return (
      <div className="dashboard-layout">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      {/* Side Panel */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <Logo />
        </div>
        
        <nav className="sidebar-nav">
          <button className="nav-item active">
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
          {user.role !== 'student' && (
            <button className="nav-item" onClick={() => navigate('/students')}>
              <span className="nav-icon">📈</span>
              Analysis Results
            </button>
          )}
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
          {user.role === 'admin' && (
            <button className="nav-item" onClick={() => navigate('/settings')}>
              <span className="nav-icon">🛡️</span>
              Admin
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item help-btn" onClick={() => setShowHelp(true)}>
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
        <header className="dashboard-header">
          <div className="header-left">
            <h2 className="page-title">Code Clone Detector</h2>
            <p className="page-subtitle">Detect duplicate code & improve quality</p>
          </div>
          <div className="header-right">
            <button className="notification-btn">
              🔔
              <span className="notification-badge">3</span>
            </button>
          </div>
        </header>

        <div className="dashboard-content">
          <div className="welcome-section">
            <h3 className="welcome-title">Welcome back, {user.full_name || user.username}!</h3>
            <p className="welcome-text">Here's what's happening with your projects today</p>
          </div>

          {/* Stats Grid */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">📊</div>
              <div className="stat-info">
                <div className="stat-label">Total Analyses</div>
                <div className="stat-value">{user.total_analyses || 0}</div>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">📁</div>
              <div className="stat-info">
                <div className="stat-label">Total Files</div>
                <div className="stat-value">{stats.totalFiles}</div>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">📜</div>
              <div className="stat-info">
                <div className="stat-label">Activities</div>
                <div className="stat-value">{stats.totalHistory}</div>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">✅</div>
              <div className="stat-info">
                <div className="stat-label">Active Projects</div>
                <div className="stat-value">{stats.activeProjects}</div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="quick-actions">
            <h4 className="section-title">Quick Actions</h4>
            <div className="action-buttons">
              <button className="action-card" onClick={() => navigate('/analyzer')}>
                <div className="action-icon">🔍</div>
                <div className="action-content">
                  <div className="action-title">Code Analyzer</div>
                  <div className="action-desc">Analyze your code for duplicates</div>
                </div>
                <div className="action-arrow">→</div>
              </button>
              
              {user.role === 'student' ? (
                <button className="action-card" onClick={() => navigate('/files')}>
                  <div className="action-icon">📝</div>
                  <div className="action-content">
                    <div className="action-title">My Submissions</div>
                    <div className="action-desc">View your submitted files</div>
                  </div>
                  <div className="action-arrow">→</div>
                </button>
              ) : (
                <button className="action-card" onClick={() => navigate('/students')}>
                  <div className="action-icon">👥</div>
                  <div className="action-content">
                    <div className="action-title">View Students</div>
                    <div className="action-desc">Manage student submissions</div>
                  </div>
                  <div className="action-arrow">→</div>
                </button>
              )}
              
              <button className="action-card">
                <div className="action-icon">📄</div>
                <div className="action-content">
                  <div className="action-title">Reports</div>
                  <div className="action-desc">View analysis reports</div>
                </div>
                <div className="action-arrow">→</div>
              </button>

              {user.role === 'admin' && (
                <button className="action-card" onClick={() => navigate('/settings')}>
                  <div className="action-icon">🛡️</div>
                  <div className="action-content">
                    <div className="action-title">Admin Panel</div>
                    <div className="action-desc">Manage users and system settings</div>
                  </div>
                  <div className="action-arrow">→</div>
                </button>
              )}
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
              <button className="help-close-btn" onClick={() => setShowHelp(false)}>✕</button>
            </div>
            <div className="help-modal-body">
              <div className="help-section">
                <h4>🔍 Code Analyzer</h4>
                <p>Upload or paste code to detect duplicates. Supports Python and Java. Use the Analyze button to get clone detection results with visual metrics.</p>
              </div>
              <div className="help-section">
                <h4>📁 Files</h4>
                <p>Upload and manage your code files (.zip, .txt, .java, .py). You can scan any uploaded file for code clones directly from the Files page.</p>
              </div>
              <div className="help-section">
                <h4>📈 Analysis Results</h4>
                <p>View and manage students organized by sections. Add students to sections and track their submissions.</p>
              </div>
              <div className="help-section">
                <h4>🔄 Refactoring</h4>
                <p>Get refactoring suggestions for your code. Detect code smells and see before/after comparisons.</p>
              </div>
              <div className="help-section">
                <h4>📜 History</h4>
                <p>Track all your activities including analyses, uploads, and refactoring operations in real-time.</p>
              </div>
              <div className="help-section">
                <h4>⚙️ Settings</h4>
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
