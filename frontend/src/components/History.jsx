import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './History.css';

const HISTORY_DATA = [
  { id: 1, type: 'analysis', icon: '🔍', description: 'Analyzed Python code - 15.3% clone detected', time: '2 hours ago', status: 'success' },
  { id: 2, type: 'upload', icon: '📤', description: 'Uploaded batch: project_files.zip - 5 files processed', time: '3 hours ago', status: 'success' },
  { id: 3, type: 'refactoring', icon: '🔄', description: 'Refactored Java code - 3 code smells fixed', time: '5 hours ago', status: 'success' },
  { id: 4, type: 'analysis', icon: '🔍', description: 'Analyzed JavaScript code - 42.7% clone detected', time: 'Yesterday', status: 'warning' },
  { id: 5, type: 'upload', icon: '📤', description: 'Uploaded file: utils.py - 1 file processed', time: 'Yesterday', status: 'success' },
  { id: 6, type: 'analysis', icon: '🔍', description: 'Analyzed C++ code - 8.1% clone detected', time: '2 days ago', status: 'success' },
  { id: 7, type: 'refactoring', icon: '🔄', description: 'Refactored Python code - 5 duplicates removed', time: '3 days ago', status: 'info' },
  { id: 8, type: 'upload', icon: '📤', description: 'Uploaded batch: homework_set3.zip - 12 files processed', time: '4 days ago', status: 'success' },
  { id: 9, type: 'analysis', icon: '🔍', description: 'Analyzed Java code - 27.5% clone detected', time: '5 days ago', status: 'warning' },
  { id: 10, type: 'refactoring', icon: '🔄', description: 'Refactored JavaScript code - 2 functions consolidated', time: '1 week ago', status: 'info' },
];

function History() {
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : { username: 'User', email: 'user@email.com', full_name: 'User' };

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

  const filtered = filter === 'all'
    ? HISTORY_DATA
    : HISTORY_DATA.filter((item) => item.type === filter);

  const totalActivities = HISTORY_DATA.length;
  const thisWeek = HISTORY_DATA.filter((h) => !h.time.includes('week')).length;
  const today = HISTORY_DATA.filter((h) => h.time.includes('hour')).length;

  return (
    <div className="history-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="sidebar-logo">Dashboard</h1>
        </div>
        <nav className="sidebar-nav">
          <button className="nav-item" onClick={() => navigate('/dashboard')}>
            <span className="nav-icon">📊</span> Dashboard
          </button>
          <button className="nav-item" onClick={() => navigate('/analyzer')}>
            <span className="nav-icon">⚙️</span> Compiler Area
          </button>
          <button className="nav-item" onClick={() => navigate('/files')}>
            <span className="nav-icon">📁</span> Files
          </button>
          <button className="nav-item" onClick={() => navigate('/students')}>
            <span className="nav-icon">📈</span> Analysis Results
          </button>
          <button className="nav-item" onClick={() => navigate('/refactoring')}>
            <span className="nav-icon">🔄</span> Refactoring
          </button>
          <button className="nav-item active">
            <span className="nav-icon">📜</span> History
          </button>
          <button className="nav-item" onClick={() => navigate('/settings')}>
            <span className="nav-icon">⚙️</span> Settings
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

      <main className="main-content">
        <header className="history-header">
          <div className="header-left">
            <h2 className="page-title">Activity History</h2>
            <p className="page-subtitle">Review your past analyses, uploads, and refactoring activities</p>
          </div>
        </header>

        <div className="history-content">
          {/* Stats Cards */}
          <div className="history-stats">
            <div className="stat-card">
              <div className="stat-icon">📋</div>
              <div className="stat-info">
                <div className="stat-value">{totalActivities}</div>
                <div className="stat-label">Total Activities</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">📅</div>
              <div className="stat-info">
                <div className="stat-value">{thisWeek}</div>
                <div className="stat-label">This Week</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">⏰</div>
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
              <div className="timeline-item" key={item.id} onClick={() => {}}>
                <div className="timeline-icon">{item.icon}</div>
                <div className="timeline-body">
                  <div className="timeline-description">{item.description}</div>
                  <div className="timeline-meta">
                    <span className="timeline-time">{item.time}</span>
                    <span className={`timeline-status ${item.status}`}>
                      {item.status === 'success' ? '✓ Success' : item.status === 'warning' ? '⚠ Warning' : 'ℹ Info'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default History;
