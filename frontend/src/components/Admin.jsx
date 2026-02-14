import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from './Logo';
import './Admin.css';

const API = 'http://localhost:5000/api/v1';
const DEFAULT_ACCENT = '#6366f1';

const FALLBACK_STUDENTS = [
  { name: 'Alice Chen', email: 'alice.chen@university.edu' },
  { name: 'Bob Martinez', email: 'bob.martinez@university.edu' },
  { name: 'Carlos Wang', email: 'carlos.wang@university.edu' },
  { name: 'Diana Lee', email: 'diana.lee@university.edu' },
  { name: 'Eve Johnson', email: 'eve.johnson@university.edu' },
  { name: 'Frank Davis', email: 'frank.davis@university.edu' },
  { name: 'Grace Kim', email: 'grace.kim@university.edu' },
  { name: 'Henry Wilson', email: 'henry.wilson@university.edu' },
];

function Admin() {
  const [user, setUser] = useState(() => {
    const userStr = localStorage.getItem('user');
    try { return userStr ? JSON.parse(userStr) : null; } catch { return null; }
  });
  const [users, setUsers] = useState([]);
  const [registeredStudents, setRegisteredStudents] = useState(FALLBACK_STUDENTS);
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
  const [assignSectionId, setAssignSectionId] = useState('');
  const [assignStudent, setAssignStudent] = useState('');
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
    if (localStorage.getItem('lightMode') === 'true') {
      document.body.classList.add('light-mode');
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
          const students = data.users
            .filter(u => u.role === 'student')
            .map(u => ({ name: u.full_name || u.username, email: u.email }));
          if (students.length > 0) setRegisteredStudents(students);
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

  function handleAssignStudent() {
    if (!assignSectionId || !assignStudent) return;
    const student = registeredStudents.find(s => s.email === assignStudent);
    if (!student) return;
    const updated = adminSections.map(sec => {
      if (sec.id === assignSectionId) {
        const already = (sec.students || []).some(s => s.email === student.email);
        if (already) return sec;
        return { ...sec, students: [...(sec.students || []), { name: student.name, email: student.email }] };
      }
      return sec;
    });
    setAdminSections(updated);
    localStorage.setItem('savedSections', JSON.stringify(updated));
    setAssignStudent('');
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
          <button className="nav-item" onClick={() => navigate('/analysis-results')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span>
            {user.role === 'student' ? 'My Results' : 'Analysis Results'}
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
          <button className="nav-item" onClick={() => navigate('/chat')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
            Chat
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

          {/* Analytics */}
          <div className="admin-section">
            <h4 className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> Analytics
            </h4>

            {/* Activity Overview - Horizontal Bar Chart */}
            <div style={{ marginBottom: '32px' }}>
              <h5 style={{ color: '#9ca3af', fontSize: '14px', fontWeight: 600, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Activity Overview (Students per Section)</h5>
              {adminSections.length === 0 ? (
                <p style={{ color: '#6b7280', fontSize: '13px' }}>No sections to display</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {adminSections.map(sec => {
                    const count = (sec.students || []).length;
                    const maxCount = Math.max(...adminSections.map(s => (s.students || []).length), 1);
                    const pct = (count / maxCount) * 100;
                    return (
                      <div key={sec.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ color: '#e5e7eb', fontSize: '13px', fontWeight: 600, minWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sec.name}</span>
                        <div style={{ flex: 1, height: '24px', background: '#1a1f36', borderRadius: '6px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, minWidth: count > 0 ? '24px' : '0', height: '100%', background: 'linear-gradient(90deg, var(--accent-color, #6366f1), #7c3aed)', borderRadius: '6px', transition: 'width 0.3s ease', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '8px' }}>
                            {count > 0 && <span style={{ color: '#fff', fontSize: '11px', fontWeight: 700 }}>{count}</span>}
                          </div>
                        </div>
                        {count === 0 && <span style={{ color: '#6b7280', fontSize: '11px', fontWeight: 600 }}>0</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Role Distribution */}
            <div style={{ marginBottom: '32px' }}>
              <h5 style={{ color: '#9ca3af', fontSize: '14px', fontWeight: 600, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Role Distribution</h5>
              {(() => {
                const total = totalAdmins + totalInstructors + totalStudents;
                if (total === 0) return <p style={{ color: '#6b7280', fontSize: '13px' }}>No users to display</p>;
                const adminPct = (totalAdmins / total) * 100;
                const instrPct = (totalInstructors / total) * 100;
                const studentPct = (totalStudents / total) * 100;
                return (
                  <div>
                    <div style={{ display: 'flex', height: '32px', borderRadius: '8px', overflow: 'hidden', marginBottom: '12px' }}>
                      {adminPct > 0 && <div style={{ width: `${adminPct}%`, background: '#ef4444', transition: 'width 0.3s ease' }} />}
                      {instrPct > 0 && <div style={{ width: `${instrPct}%`, background: '#f59e0b', transition: 'width 0.3s ease' }} />}
                      {studentPct > 0 && <div style={{ width: `${studentPct}%`, background: 'var(--accent-color, #6366f1)', transition: 'width 0.3s ease' }} />}
                    </div>
                    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#ef4444', display: 'inline-block' }} />
                        <span style={{ color: '#e5e7eb', fontSize: '13px', fontWeight: 500 }}>Admin ({totalAdmins})</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#f59e0b', display: 'inline-block' }} />
                        <span style={{ color: '#e5e7eb', fontSize: '13px', fontWeight: 500 }}>Instructor ({totalInstructors})</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--accent-color, #6366f1)', display: 'inline-block' }} />
                        <span style={{ color: '#e5e7eb', fontSize: '13px', fontWeight: 500 }}>Student ({totalStudents})</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Recent Activity */}
            <div>
              <h5 style={{ color: '#9ca3af', fontSize: '14px', fontWeight: 600, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recent Activity</h5>
              {(() => {
                let activities;
                try {
                  const raw = localStorage.getItem('activityHistory');
                  activities = raw ? JSON.parse(raw) : null;
                } catch {
                  activities = null;
                }
                if (!activities || !Array.isArray(activities) || activities.length === 0) {
                  activities = [
                    { action: 'Section "CS101" created', timestamp: new Date(Date.now() - 3600000).toISOString() },
                    { action: 'User role updated to instructor', timestamp: new Date(Date.now() - 7200000).toISOString() },
                    { action: 'New student registered', timestamp: new Date(Date.now() - 10800000).toISOString() },
                  ];
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {activities.slice(0, 10).map((a, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: '#1a1f36', borderRadius: '8px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <span style={{ flex: 1, color: '#e5e7eb', fontSize: '13px' }}>{a.action}</span>
                        <span style={{ color: '#6b7280', fontSize: '11px', whiteSpace: 'nowrap' }}>
                          {a.timestamp ? new Date(a.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}
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

            {/* Assign Student to Section */}
            <div style={{ background: '#1a1f36', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <h5 style={{ color: '#e5e7eb', fontSize: '15px', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                Assign Student to Section
              </h5>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  className="role-select"
                  value={assignSectionId}
                  onChange={(e) => { setAssignSectionId(e.target.value); setAssignStudent(''); }}
                  style={{ minWidth: '200px' }}
                >
                  <option value="">Select section...</option>
                  {adminSections.map(sec => (
                    <option key={sec.id} value={sec.id}>{sec.name}</option>
                  ))}
                </select>
                <select
                  className="role-select"
                  value={assignStudent}
                  onChange={(e) => setAssignStudent(e.target.value)}
                  style={{ minWidth: '200px' }}
                  disabled={!assignSectionId}
                >
                  <option value="">Select student...</option>
                  {(() => {
                    const sec = adminSections.find(s => s.id === assignSectionId);
                    const existing = sec ? (sec.students || []).map(s => s.email) : [];
                    return registeredStudents.filter(s => !existing.includes(s.email));
                  })().map(s => (
                    <option key={s.email} value={s.email}>{s.name} ({s.email})</option>
                  ))}
                </select>
                <button
                  className="action-btn primary"
                  onClick={handleAssignStudent}
                  disabled={!assignSectionId || !assignStudent}
                  style={{ padding: '10px 20px', background: 'var(--accent-color, #6366f1)', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 600, cursor: !assignSectionId || !assignStudent ? 'not-allowed' : 'pointer', opacity: !assignSectionId || !assignStudent ? 0.5 : 1 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Assign
                </button>
              </div>
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
