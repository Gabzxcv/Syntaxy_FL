import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './settings.css';

const API = 'http://localhost:5000/api/v1';

function Settings() {
  const navigate = useNavigate();
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : { username: 'User', email: 'user@email.com', full_name: 'User' };

  const [showHelp, setShowHelp] = useState(false);
  const [editFullName, setEditFullName] = useState(user.full_name || '');
  const [editEmail, setEditEmail] = useState(user.email || '');
  const [accountSaving, setAccountSaving] = useState(false);

  const [settings, setSettings] = useState({
    emailNotifications: true,
    autoSave: true,
    darkMode: localStorage.getItem('darkMode') === 'true',
    languageDefault: 'python',
    maxFileSize: '10',
    enableHistory: true,
  });

  useEffect(() => {
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('darkMode', settings.darkMode);
    if (settings.darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [settings.darkMode]);

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
    alert('Settings saved successfully!');
    console.log('Saved settings:', settings);
  }

  return (
    <div className="settings-layout">
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
          <button className="nav-item" onClick={() => navigate('/files')}>
            <span className="nav-icon">📁</span>
            Files
          </button>
          <button className="nav-item" onClick={() => navigate('/students')}>
            <span className="nav-icon">📈</span>
            Analysis Results
          </button>
          <button className="nav-item" onClick={() => navigate('/refactoring')}>
            <span className="nav-icon">🔄</span>
            Refactoring
          </button>
          <button className="nav-item" onClick={() => navigate('/history')}>
            <span className="nav-icon">📜</span>
            History
          </button>
          <button className="nav-item active">
            <span className="nav-icon">⚙️</span>
            Settings
          </button>
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
        <header className="settings-header">
          <div className="header-left">
            <h2 className="page-title">Settings</h2>
            <p className="page-subtitle">Manage your preferences and application settings</p>
          </div>
        </header>

        <div className="settings-content">
          {/* General Settings */}
          <section className="settings-section">
            <h3 className="section-title">General Settings</h3>
            
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
                  <div className="setting-label">Dark Mode</div>
                  <div className="setting-description">Enable dark theme</div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.darkMode}
                    onChange={(e) => handleSettingChange('darkMode', e.target.checked)}
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
            <h3 className="section-title">Code Analysis Settings</h3>
            
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
            <h3 className="section-title">Account Information</h3>
            
            <div className="account-info-card">
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
                <span className="btn-icon">💾</span>
                {accountSaving ? 'Saving...' : 'Save Account'}
              </button>
            </div>
          </section>

          {/* Save Button */}
          <div className="settings-actions">
            <button className="action-btn secondary" onClick={() => navigate('/dashboard')}>
              Cancel
            </button>
            <button className="action-btn primary" onClick={saveSettings}>
              <span className="btn-icon">💾</span>
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

export default Settings;