import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from './Logo';
import './settings.css';

const API = 'http://localhost:5000/api/v1';

function Settings() {
  const navigate = useNavigate();
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : { username: 'User', email: 'user@email.com', full_name: 'User' };
  const isStudent = user.role === 'student';

  const [showHelp, setShowHelp] = useState(false);
  const [editFullName, setEditFullName] = useState(user.full_name || '');
  const [editEmail, setEditEmail] = useState(user.email || '');
  const [accountSaving, setAccountSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');

  const [profilePicture, setProfilePicture] = useState(() =>
    localStorage.getItem('profilePicture_' + user.id) || ''
  );

  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('appSettings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...parsed, lightMode: localStorage.getItem('lightMode') === 'true' };
      } catch (e) {
        console.warn('Failed to parse saved settings:', e);
      }
    }
    return {
      emailNotifications: true,
      autoSave: true,
      lightMode: localStorage.getItem('lightMode') === 'true',
      languageDefault: 'python',
      maxFileSize: '10',
      enableHistory: true,
    };
  });

  useEffect(() => {
    const isLight = localStorage.getItem('lightMode') === 'true';
    if (isLight) {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('lightMode', settings.lightMode);
    if (settings.lightMode) {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }, [settings.lightMode]);

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

  function handleSettingChange(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  function saveSettings() {
    try {
      localStorage.setItem('appSettings', JSON.stringify(settings));
      alert('Settings saved successfully!');
    } catch (e) {
      console.error('Failed to save settings:', e);
      alert('Failed to save settings. Storage may be full.');
    }
  }

  return (
    <div className="settings-layout">
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
            Analysis Results
          </button>
          <button className="nav-item" onClick={() => navigate('/refactoring')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></span>
            Refactoring
          </button>
          <button className="nav-item" onClick={() => navigate('/history')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
            History
          </button>
          <button className="nav-item active">
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

      {/* Main Content */}
      <main className="main-content">
        <header className="settings-header">
          <div className="header-left">
            <h2 className="page-title">{isStudent ? 'My Account' : 'Settings'}</h2>
            <p className="page-subtitle">{isStudent ? 'Manage your account and preferences' : 'Manage your preferences and application settings'}</p>
          </div>
        </header>

        <div className="settings-content">
          {/* General Settings */}
          <section className="settings-section">
            <h3 className="section-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle',marginRight:'8px'}}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>General Settings</h3>
            
            <div className="settings-grid">
              <div className="setting-item">
                <div className="setting-info">
                  <div className="setting-label">Email Notifications</div>
                  <div className="setting-description">Receive email alerts for analysis results</div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.emailNotifications}
                    onChange={(e) => handleSettingChange('emailNotifications', e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="setting-item">
                <div className="setting-info">
                  <div className="setting-label">Auto-Save</div>
                  <div className="setting-description">Automatically save your code while typing</div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.autoSave}
                    onChange={(e) => handleSettingChange('autoSave', e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="setting-item">
                <div className="setting-info">
                  <div className="setting-label">Light Mode</div>
                  <div className="setting-description">Switch to light beige theme</div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.lightMode}
                    onChange={(e) => handleSettingChange('lightMode', e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="setting-item">
                <div className="setting-info">
                  <div className="setting-label">Enable History</div>
                  <div className="setting-description">Track your analysis history</div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.enableHistory}
                    onChange={(e) => handleSettingChange('enableHistory', e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </section>

          {/* Code Analysis Settings */}
          <section className="settings-section">
            <h3 className="section-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle',marginRight:'8px'}}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>Code Analysis Settings</h3>
            
            <div className="settings-grid">
              <div className="setting-item-full">
                <div className="setting-info">
                  <div className="setting-label">Default Language</div>
                  <div className="setting-description">Select your preferred programming language</div>
                </div>
                <select
                  className="setting-select"
                  value={settings.languageDefault}
                  onChange={(e) => handleSettingChange('languageDefault', e.target.value)}
                >
                  <option value="python">Python</option>
                  <option value="java">Java</option>
                  <option value="javascript">JavaScript (Coming Soon)</option>
                  <option value="cpp">C++ (Coming Soon)</option>
                </select>
              </div>

              <div className="setting-item-full">
                <div className="setting-info">
                  <div className="setting-label">Maximum File Size (MB)</div>
                  <div className="setting-description">Maximum allowed file size for uploads</div>
                </div>
                <input
                  type="number"
                  className="setting-input"
                  value={settings.maxFileSize}
                  onChange={(e) => handleSettingChange('maxFileSize', e.target.value)}
                  min="1"
                  max="100"
                />
              </div>
            </div>
          </section>

          {/* Account Settings */}
          <section className="settings-section">
            <h3 className="section-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle',marginRight:'8px'}}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Account Information</h3>
            
            <div className="account-info-card">
              <div className="account-row" style={{ flexDirection: 'column', alignItems: 'center', gap: '8px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <div
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    background: profilePicture ? 'none' : '#6C63FF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '32px',
                    fontWeight: 'bold',
                    color: '#fff',
                    overflow: 'hidden',
                  }}
                >
                  {profilePicture ? (
                    <img src={profilePicture} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    (user.full_name || user.username).charAt(0).toUpperCase()
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  id="profile-pic-input"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) {
                      alert('Image must be under 2MB.');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      const base64 = reader.result;
                      setProfilePicture(base64);
                      localStorage.setItem('profilePicture_' + user.id, base64);
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                <button
                  className="action-btn secondary"
                  style={{ padding: '4px 12px', fontSize: '13px' }}
                  onClick={() => document.getElementById('profile-pic-input').click()}
                >
                  Change Photo
                </button>
              </div>
              <div className="account-row">
                <span className="account-label">Username:</span>
                <span className="account-value">{user.username}</span>
              </div>
              <div className="account-row">
                <span className="account-label">Email:</span>
                <input
                  type="email"
                  className="setting-input"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
              </div>
              <div className="account-row">
                <span className="account-label">Full Name:</span>
                <input
                  type="text"
                  className="setting-input"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="Enter full name"
                />
              </div>
              <div className="account-row">
                <span className="account-label">Account Type:</span>
                <span className="account-badge">Premium</span>
              </div>
              <button
                className="action-btn primary"
                style={{ marginTop: '12px' }}
                disabled={accountSaving}
                onClick={async () => {
                  setAccountSaving(true);
                  try {
                    const token = localStorage.getItem('token');
                    const res = await fetch(`${API}/auth/me`, {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify({ full_name: editFullName, email: editEmail }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      const updatedUser = data.user || { ...user, full_name: editFullName, email: editEmail };
                      localStorage.setItem('user', JSON.stringify(updatedUser));
                      alert('Account updated successfully!');
                    } else {
                      const data = await res.json().catch(() => ({}));
                      alert(data.error || 'Failed to update account');
                    }
                  } catch {
                    alert('Unable to connect to server. Please check your connection and try again.');
                  } finally {
                    setAccountSaving(false);
                  }
                }}
              >
                {accountSaving ? 'Saving...' : 'Save Account'}
              </button>
            </div>
          </section>

          {/* Change Password */}
          <section className="settings-section">
            <h3 className="section-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle',marginRight:'8px'}}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Change Password</h3>

            <div className="account-info-card">
              {passwordMessage && (
                <div style={{ marginBottom: '12px', color: passwordMessage.startsWith('Error') ? '#ff6b6b' : '#51cf66', fontSize: '14px' }}>
                  {passwordMessage}
                </div>
              )}
              <div className="account-row">
                <span className="account-label">Current Password:</span>
                <input
                  type="password"
                  className="setting-input"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
              </div>
              <div className="account-row">
                <span className="account-label">New Password:</span>
                <input
                  type="password"
                  className="setting-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                />
              </div>
              <div className="account-row">
                <span className="account-label">Confirm New Password:</span>
                <input
                  type="password"
                  className="setting-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                />
              </div>
              <button
                className="action-btn primary"
                style={{ marginTop: '12px' }}
                disabled={passwordChanging}
                onClick={async () => {
                  setPasswordMessage('');
                  if (newPassword !== confirmPassword) {
                    setPasswordMessage('Error: New passwords do not match.');
                    return;
                  }
                  if (newPassword.length < 6) {
                    setPasswordMessage('Error: Password must be at least 6 characters.');
                    return;
                  }
                  setPasswordChanging(true);
                  try {
                    const token = localStorage.getItem('token');
                    const res = await fetch(`${API}/auth/change-password`, {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
                    });
                    if (res.ok) {
                      setPasswordMessage('Password changed successfully!');
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                    } else {
                      const data = await res.json().catch(() => ({}));
                      setPasswordMessage('Error: ' + (data.error || 'Failed to change password'));
                    }
                  } catch {
                    setPasswordMessage('Error: Unable to connect to server.');
                  } finally {
                    setPasswordChanging(false);
                  }
                }}
              >
                {passwordChanging ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </section>

          {/* Save Button */}
          <div className="settings-actions">
            <button className="action-btn secondary" onClick={() => navigate('/dashboard')}>
              Cancel
            </button>
            <button className="action-btn primary" onClick={saveSettings}>
              Save Settings
            </button>
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

export default Settings;