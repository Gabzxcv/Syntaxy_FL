import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Students.css';

const API = 'http://localhost:5000/api/v1';

function Students() {
  const navigate = useNavigate();
  const [students] = useState([
    { id: 1, name: 'Alice Johnson', email: 'alice@example.com', submissions: 5 },
    { id: 2, name: 'Bob Smith', email: 'bob@example.com', submissions: 3 },
    { id: 3, name: 'Carol Williams', email: 'carol@example.com', submissions: 7 },
    { id: 4, name: 'David Brown', email: 'david@example.com', submissions: 4 },
    { id: 5, name: 'Emma Davis', email: 'emma@example.com', submissions: 6 },
  ]);

  // Get user info from localStorage for sidebar
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
          <button className="nav-item">
            <span className="nav-icon">📁</span>
            Files
          </button>
          <button className="nav-item active">
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
          <button className="nav-item">
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
            <h2 className="page-title">Students Management</h2>
            <p className="page-subtitle">Manage students and view their submissions</p>
          </div>
        </header>

        <div className="students-content">
          {/* Statistics Cards */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                👥
              </div>
              <div className="stat-info">
                <div className="stat-label">Total Students</div>
                <div className="stat-value">{students.length}</div>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                📝
              </div>
              <div className="stat-info">
                <div className="stat-label">Total Submissions</div>
                <div className="stat-value">
                  {students.reduce((acc, s) => acc + s.submissions, 0)}
                </div>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                📊
              </div>
              <div className="stat-info">
                <div className="stat-label">Avg Submissions</div>
                <div className="stat-value">
                  {(students.reduce((acc, s) => acc + s.submissions, 0) / students.length).toFixed(1)}
                </div>
              </div>
            </div>
          </div>

          {/* Students Table Section */}
          <section className="students-section">
            <div className="section-header">
              <h3 className="section-title">All Students</h3>
              <button className="action-btn primary">
                <span className="btn-icon">➕</span>
                Add Student
              </button>
            </div>

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
                  {students.map((student) => (
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
                  ))}
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