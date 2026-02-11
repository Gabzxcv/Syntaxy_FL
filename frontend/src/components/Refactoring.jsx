import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from './Logo';
import './Refactoring.css';

const PYTHON_SMELLY = `def process_data(data):
    # Magic numbers everywhere
    result = data * 3.14159
    if result > 100:
        print("High value: " + str(result))
        log_file = open("log.txt", "a")
        log_file.write("High value: " + str(result))
        log_file.close()
    if result > 200:
        print("Very high value: " + str(result))
        log_file = open("log.txt", "a")
        log_file.write("Very high value: " + str(result))
        log_file.close()
    temp = result * 2.71828
    if temp > 500:
        print("Critical: " + str(temp))
        log_file = open("log.txt", "a")
        log_file.write("Critical: " + str(temp))
        log_file.close()
    return result + temp

def calculate(x, y, z):
    a = x * 3.14159
    b = y * 2.71828
    c = z * 1.41421
    return a + b + c`;

const JAVA_SMELLY = `public class DataProcessor {
    public double processData(double data) {
        double result = data * 3.14159;
        if (result > 100) {
            System.out.println("High value: " + result);
            FileWriter fw = new FileWriter("log.txt", true);
            fw.write("High value: " + result);
            fw.close();
        }
        if (result > 200) {
            System.out.println("Very high value: " + result);
            FileWriter fw = new FileWriter("log.txt", true);
            fw.write("Very high value: " + result);
            fw.close();
        }
        double temp = result * 2.71828;
        return result + temp;
    }

    public double calculate(double x, double y, double z) {
        double a = x * 3.14159;
        double b = y * 2.71828;
        double c = z * 1.41421;
        return a + b + c;
    }
}`;

const MOCK_SMELLS = [
  { name: 'Long Method', severity: 'high', location: 'process_data (lines 1-20)', description: 'Method exceeds recommended length of 15 lines.' },
  { name: 'Duplicate Code', severity: 'high', location: 'Lines 5-8 and 10-13', description: 'Repeated file logging pattern found in multiple blocks.' },
  { name: 'Magic Numbers', severity: 'medium', location: 'Lines 3, 15, 24, 25, 26', description: 'Numeric literals 3.14159, 2.71828, 1.41421 used without named constants.' },
];

const MOCK_SUGGESTIONS = [
  {
    title: 'Extract logging into a helper function',
    original: `log_file = open("log.txt", "a")
log_file.write("High value: " + str(result))
log_file.close()`,
    refactored: `def _log_message(message):
    with open("log.txt", "a") as log_file:
        log_file.write(message)

_log_message("High value: " + str(result))`,
  },
  {
    title: 'Replace magic numbers with named constants',
    original: `result = data * 3.14159
temp = result * 2.71828`,
    refactored: `PI = 3.14159
EULER = 2.71828

result = data * PI
temp = result * EULER`,
  },
  {
    title: 'Simplify conditional logging',
    original: `if result > 100:
    print("High value: " + str(result))
    ...
if result > 200:
    print("Very high value: " + str(result))
    ...`,
    refactored: `THRESHOLDS = {100: "High", 200: "Very high"}

for threshold, label in sorted(THRESHOLDS.items()):
    if result > threshold:
        msg = f"{label} value: {result}"
        print(msg)
        _log_message(msg)`,
  },
];

const MOCK_QUALITY_SCORES = { before: 42, after: 87 };

function Refactoring() {
  const [language, setLanguage] = useState(() => {
    const refactoringLanguage = localStorage.getItem('refactoringLanguage');
    if (refactoringLanguage) {
      localStorage.removeItem('refactoringLanguage');
      return refactoringLanguage;
    }
    return 'python';
  });
  const [code, setCode] = useState(() => {
    const refactoringCode = localStorage.getItem('refactoringCode');
    if (refactoringCode) {
      localStorage.removeItem('refactoringCode');
      return refactoringCode;
    }
    return '';
  });
  const [analyzed, setAnalyzed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const navigate = useNavigate();

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : { username: 'User', email: 'user@email.com', full_name: 'User' };
  const profilePic = user ? localStorage.getItem('profilePicture_' + user.id) : null;

  useEffect(() => {
    if (localStorage.getItem('darkMode') === 'true') {
      document.body.classList.add('dark-mode');
    }
  }, []);

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

  function loadSample() {
    setCode(language === 'python' ? PYTHON_SMELLY : JAVA_SMELLY);
    setAnalyzed(false);
  }

  function handleAnalyze() {
    if (!code.trim()) {
      alert('Please enter some code to analyze!');
      return;
    }
    setAnalyzed(true);
  }

  const smellCount = analyzed ? MOCK_SMELLS.length : 0;
  const suggestionCount = analyzed ? MOCK_SUGGESTIONS.length : 0;
  const { before: scoreBefore, after: scoreAfter } = MOCK_QUALITY_SCORES;

  return (
    <div className="refactoring-layout">
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
          <button className="nav-item active">
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

      {/* Main Content */}
      <main className="main-content">
        <header className="refactoring-header">
          <div className="header-left">
            <h2 className="page-title">Code Refactoring</h2>
            <p className="page-subtitle">Detect code smells and get refactoring suggestions</p>
          </div>
        </header>

        <div className="refactoring-content">
          {/* Stats Cards */}
          <section className="stats-cards">
            <div className="stat-card">
              <div className="stat-icon smell-icon"></div>
              <div className="stat-info">
                <div className="stat-value">{smellCount}</div>
                <div className="stat-label">Code Smells Found</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon suggestion-icon"></div>
              <div className="stat-info">
                <div className="stat-value">{suggestionCount}</div>
                <div className="stat-label">Suggestions Generated</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon score-icon"></div>
              <div className="stat-info">
                <div className="stat-value">{analyzed ? `${scoreBefore} → ${scoreAfter}` : '—'}</div>
                <div className="stat-label">Quality Score</div>
              </div>
            </div>
          </section>

          {/* Code Input Section */}
          <section className="refactoring-section">
            <h3 className="section-title">Source Code</h3>

            <div className="controls-row">
              <div className="control-group">
                <label className="control-label">Language</label>
                <select
                  className="language-select"
                  value={language}
                  onChange={(e) => { setLanguage(e.target.value); setAnalyzed(false); }}
                >
                  <option value="python">Python</option>
                  <option value="java">Java</option>
                </select>
              </div>

              <button className="action-btn secondary" onClick={loadSample}>
                Load Sample
              </button>
            </div>

            <div className="code-editor-container">
              <div className="editor-header">
                <span className="editor-label">Code Editor</span>
                <span className="editor-lang">{language === 'python' ? 'Python' : 'Java'}</span>
              </div>
              <textarea
                className="code-editor"
                value={code}
                onChange={(e) => { setCode(e.target.value); setAnalyzed(false); }}
                placeholder="Paste your code here to detect code smells..."
              />
            </div>

            <button className="action-btn primary analyze-btn" onClick={handleAnalyze}>
              Analyze &amp; Refactor
            </button>
          </section>

          {/* Results Section */}
          {analyzed && (
            <section className="refactoring-section results-section">
              <h3 className="section-title">Detected Code Smells</h3>
              <div className="smells-list">
                {MOCK_SMELLS.map((smell, i) => (
                  <div key={i} className={`smell-card severity-${smell.severity}`}>
                    <div className="smell-header">
                      <span className="smell-name">{smell.name}</span>
                      <span className={`severity-badge ${smell.severity}`}>{smell.severity}</span>
                    </div>
                    <div className="smell-location">{smell.location}</div>
                    <div className="smell-description">{smell.description}</div>
                  </div>
                ))}
              </div>

              <h3 className="section-title suggestions-title">Refactoring Suggestions</h3>
              <div className="suggestions-list">
                {MOCK_SUGGESTIONS.map((suggestion, i) => (
                  <div key={i} className="suggestion-card">
                    <div className="suggestion-header">
                      <span className="suggestion-number">#{i + 1}</span>
                      <span className="suggestion-title">{suggestion.title}</span>
                    </div>
                    <div className="code-comparison">
                      <div className="code-block original">
                        <div className="code-block-label">Original</div>
                        <pre>{suggestion.original}</pre>
                      </div>
                      <div className="code-block refactored">
                        <div className="code-block-label">Refactored</div>
                        <pre>{suggestion.refactored}</pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quality Score Comparison */}
              <div className="quality-comparison">
                <h3 className="section-title">Quality Score Comparison</h3>
                <div className="score-bars">
                  <div className="score-row">
                    <span className="score-label">Before</span>
                    <div className="score-bar-track">
                      <div className="score-bar-fill before" style={{ width: `${scoreBefore}%` }} />
                    </div>
                    <span className="score-value before-value">{scoreBefore}/100</span>
                  </div>
                  <div className="score-row">
                    <span className="score-label">After</span>
                    <div className="score-bar-track">
                      <div className="score-bar-fill after" style={{ width: `${scoreAfter}%` }} />
                    </div>
                    <span className="score-value after-value">{scoreAfter}/100</span>
                  </div>
                </div>
              </div>

              {/* Cross-page link */}
              <div className="cross-page-actions">
                <button className="action-btn primary" onClick={() => navigate('/analyzer')}>
                  Analyze More Code
                </button>
                <button className="action-btn secondary" onClick={() => navigate('/students')}>
                  View Analysis Results
                </button>
              </div>
            </section>
          )}
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

export default Refactoring;
