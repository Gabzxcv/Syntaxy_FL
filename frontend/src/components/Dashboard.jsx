import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

const API = 'http://localhost:5000/api/v1';

function Dashboard() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (!token || !userStr) {
      navigate('/login');
      return;
    }
    fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Token expired');
      })
      .then((data) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
      });
  }, [navigate]);

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
          <h1 className="sidebar-logo">Dashboard</h1>
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
          <button className="nav-item">
            <span className="nav-icon">📁</span>
            Files
          </button>
          <button className="nav-item" onClick={() => navigate('/students')}>
            <span className="nav-icon">📈</span>
            Analysis Results
          </button>
          <button className="nav-item">
            <span className="nav-icon">🔄</span>
            Refactoring
          </button>
          <button className="nav-item">
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
              <div className="stat-icon">📅</div>
              <div className="stat-info">
                <div className="stat-label">Member Since</div>
                <div className="stat-value">
                  {user.created_at 
                    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                    : 'N/A'}
                </div>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">✅</div>
              <div className="stat-info">
                <div className="stat-label">Active Projects</div>
                <div className="stat-value">0</div>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">⚡</div>
              <div className="stat-info">
                <div className="stat-label">Recent Activity</div>
                <div className="stat-value">Today</div>
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
              
              <button className="action-card" onClick={() => navigate('/students')}>
                <div className="action-icon">👥</div>
                <div className="action-content">
                  <div className="action-title">View Students</div>
                  <div className="action-desc">Manage student submissions</div>
                </div>
                <div className="action-arrow">→</div>
              </button>
              
              <button className="action-card">
                <div className="action-icon">📄</div>
                <div className="action-content">
                  <div className="action-title">Reports</div>
                  <div className="action-desc">View analysis reports</div>
                </div>
                <div className="action-arrow">→</div>
              </button>
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
    </div>
  );
}

export default Dashboard;
