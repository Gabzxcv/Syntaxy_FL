import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from './Logo';
import './Admin.css';

const API = 'http://localhost:5000/api/v1';
const DEFAULT_ACCENT = '#6366f1';

function Admin() {
  const [user, setUser] = useState(() => {
    const userStr = localStorage.getItem('user');
    try { return userStr ? JSON.parse(userStr) : null; } catch { return null; }
  });
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [accentColor, setAccentColor] = useState(() => {
    return localStorage.getItem('uiAccentColor') || DEFAULT_ACCENT;
  });
  const [newSectionName, setNewSectionName] = useState('');
  const [assignInstructor, setAssignInstructor] = useState('');
  const [adminSections, setAdminSections] = useState(() => {
    const saved = localStorage.getItem('savedSections');
    return saved ? JSON.parse(saved) : [];
  });
  const navigate = useNavigate();
  const profilePic = user ? localStorage.getItem('profilePicture_' + user.id) : null;

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (!token || !userStr) {
      navigate('/login');
      return;
    }
    let parsed;
    try { parsed = JSON.parse(userStr); } catch { parsed = null; }
    if (!parsed || parsed.role !== 'admin') {
      navigate('/dashboard');
      return;
    }
    fetchUsers(token);
  }, [navigate]);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent-color', accentColor);
  }, [accentColor]);

  useEffect(() => {
    if (localStorage.getItem('darkMode') === 'true') {
      document.body.classList.add('dark-mode');
    }
  }, []);

  function fetchUsers(token) {
    fetch(`${API}/auth/admin/users`, {
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
        if (data && data.users) {
          setUsers(data.users);
        }
      })
      .catch(() => {});
  }

  function handleDeleteUser(userId) {
    const token = localStorage.getItem('token');
    if (!token) return;
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    fetch(`${API}/auth/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.ok) {
          setUsers((prev) => prev.filter((u) => u._id !== userId && u.id !== userId));
        }
      })
      .catch(() => {});
  }

  function handleRoleChange(userId, newRole) {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${API}/auth/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: newRole }),
    })
      .then((res) => {
        if (res.ok) {
          setUsers((prev) =>
            prev.map((u) =>
              (u._id === userId || u.id === userId) ? { ...u, role: newRole } : u
            )
          );
        }
      })
      .catch(() => {});
  }

  function handleAccentChange(e) {
    const color = e.target.value;
    setAccentColor(color);
    localStorage.setItem('uiAccentColor', color);
    document.documentElement.style.setProperty('--accent-color', color);
    // Persist to backend for all users
    const token = localStorage.getItem('token');
    if (token) {
      fetch(`${API}/auth/admin/theme`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accentColor: color }),
      }).catch(() => {});
    }
  }

  function handleResetAccent() {
    setAccentColor(DEFAULT_ACCENT);
    localStorage.setItem('uiAccentColor', DEFAULT_ACCENT);
    document.documentElement.style.setProperty('--accent-color', DEFAULT_ACCENT);
    const token = localStorage.getItem('token');
    if (token) {
      fetch(`${API}/auth/admin/theme`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accentColor: DEFAULT_ACCENT }),
      }).catch(() => {});
    }
  }

  function handleCreateSection() {
    if (!newSectionName.trim()) return;
    const newSection = {
      id: Date.now().toString(),
      name: newSectionName.trim(),
      instructor: assignInstructor || null,
      students: [],
      createdAt: new Date().toISOString(),
    };
    const updated = [...adminSections, newSection];
    setAdminSections(updated);
    localStorage.setItem('savedSections', JSON.stringify(updated));
    setNewSectionName('');
    setAssignInstructor('');
  }

  function handleDeleteSection(sectionId) {
    if (!window.confirm('Are you sure you want to delete this section?')) return;
    const updated = adminSections.filter(s => s.id !== sectionId);
    setAdminSections(updated);
    localStorage.setItem('savedSections', JSON.stringify(updated));
  }

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
      <div className="admin-layout">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      (u.username || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.full_name || '').toLowerCase().includes(q)
    );
  });

  const totalUsers = users.length;
  const totalStudents = users.filter((u) => u.role === 'student').length;
  const totalInstructors = users.filter((u) => u.role === 'instructor').length;
  const totalAdmins = users.filter((u) => u.role === 'admin').length;
  const currentUserId = user._id || user.id;

  return (
    <div className="admin-layout">
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
          <button className="nav-item" onClick={() => navigate('/students')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span>
            {user.role === 'student' ? 'My Results' : 'Analysis Results'}
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
          <button className="nav-item active">
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span>
            Admin
          </button>
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item help-btn">
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
        <header className="admin-header">
          <div className="header-left">
            <h2 className="page-title">Admin Panel</h2>
            <p className="page-subtitle">Manage users and system settings</p>
          </div>
        </header>

        <div className="admin-content">
          {/* Stats Cards */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
              <div className="stat-info">
                <div className="stat-label">Total Users</div>
                <div className="stat-value">{totalUsers}</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
              <div className="stat-info">
                <div className="stat-label">Students</div>
                <div className="stat-value">{totalStudents}</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div>
              <div className="stat-info">
                <div className="stat-label">Instructors</div>
                <div className="stat-value">{totalInstructors}</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
              <div className="stat-info">
                <div className="stat-label">Admins</div>
                <div className="stat-value">{totalAdmins}</div>
              </div>
            </div>
          </div>

          {/* User Management */}
          <div className="admin-section">
            <h4 className="section-title">User Management</h4>
            <div className="search-bar">
              <span className="search-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
              <input
                type="text"
                className="search-input"
                placeholder="Search users by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Full Name</th>
                    <th>Role</th>
                    <th>Created At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', color: '#6b7280' }}>
                        No users found
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const uid = u._id || u.id;
                      const isCurrentUser = uid === currentUserId;
                      return (
                        <tr key={uid}>
                          <td>{u.username}</td>
                          <td>{u.email}</td>
                          <td>{u.full_name || '—'}</td>
                          <td>
                            <select
                              className="role-select"
                              value={u.role}
                              onChange={(e) => handleRoleChange(uid, e.target.value)}
                            >
                              <option value="student">Student</option>
                              <option value="instructor">Instructor</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td>
                            {u.created_at
                              ? new Date(u.created_at).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : '—'}
                          </td>
                          <td>
                            <button
                              className="delete-btn"
                              onClick={() => handleDeleteUser(uid)}
                              disabled={isCurrentUser}
                              title={isCurrentUser ? 'Cannot delete your own account' : 'Delete user'}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* UI Theme Color */}
          <div className="admin-section">
            <h4 className="section-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12c0 1.82.487 3.53 1.338 5H6.5a2.5 2.5 0 0 0 0 5H12z"/></svg> UI Theme Color</h4>
            <div className="color-picker-section">
              <div className="color-swatch" style={{ backgroundColor: accentColor }} />
              <input
                type="color"
                className="color-picker-input"
                value={accentColor}
                onChange={handleAccentChange}
              />
              <span className="color-hex">{accentColor}</span>
              <button className="reset-color-btn" onClick={handleResetAccent}>
                Reset to Default
              </button>
            </div>
          </div>

          {/* Section Management */}
          <div className="admin-section">
            <h4 className="section-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> Section Management</h4>
            <p style={{ color: '#9ca3af', fontSize: '13px', marginBottom: '16px' }}>
              Create sections and assign them to instructors. Sections will be available for file uploads and batch analysis.
            </p>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="search-input"
                placeholder="New section name..."
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                style={{ flex: 1, minWidth: '200px', padding: '10px 16px', background: '#1e2538', border: '2px solid #374151', borderRadius: '10px', color: '#e5e7eb', fontSize: '14px' }}
              />
              <select
                className="role-select"
                value={assignInstructor}
                onChange={(e) => setAssignInstructor(e.target.value)}
                style={{ minWidth: '200px' }}
              >
                <option value="">Assign to instructor...</option>
                {users.filter(u => u.role === 'instructor').map(u => (
                  <option key={u._id || u.id} value={u.username}>{u.full_name || u.username}</option>
                ))}
              </select>
              <button
                className="action-btn primary"
                onClick={handleCreateSection}
                style={{ padding: '10px 20px', background: 'var(--accent-color, #6366f1)', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Create Section
              </button>
            </div>

            {adminSections.length === 0 ? (
              <p style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>No sections created yet</p>
            ) : (
              <div className="table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Section Name</th>
                      <th>Assigned Instructor</th>
                      <th>Students</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminSections.map((sec) => (
                      <tr key={sec.id}>
                        <td style={{ fontWeight: 600 }}>{sec.name}</td>
                        <td>{sec.instructor || '—'}</td>
                        <td>{(sec.students || []).length}</td>
                        <td>{sec.createdAt ? new Date(sec.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                        <td>
                          <button
                            className="delete-btn"
                            onClick={() => handleDeleteSection(sec.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default Admin;
