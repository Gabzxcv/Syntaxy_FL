import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './settings.css';

const API = 'http://localhost:5000/api/v1';

function Settings() {
  const navigate = useNavigate();
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : { username: 'User', email: 'user@email.com', full_name: 'User' };

  const [settings, setSettings] = useState({
    emailNotifications: true,
    autoSave: true,
    darkMode: false,
    languageDefault: 'python',
    maxFileSize: '10',
    enableHistory: true,
  });

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
          <button className="nav-item">
            <span className="nav-icon">📜</span>
            History
          </button>
          <button className="nav-item active">
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
                  <div className="setting-description">Enable dark theme (Coming soon)</div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.darkMode}
                    onChange={(e) => handleSettingChange('darkMode', e.target.checked)}
                    disabled
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
                <span className="account-value">{user.email}</span>
              </div>
              <div className="account-row">
                <span className="account-label">Full Name:</span>
                <span className="account-value">{user.full_name || 'Not set'}</span>
              </div>
              <div className="account-row">
                <span className="account-label">Account Type:</span>
                <span className="account-badge">Premium</span>
              </div>
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
    </div>
  );
}

export default Settings;