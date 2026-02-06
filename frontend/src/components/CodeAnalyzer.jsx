import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import './CodeAnalyzer.css';

const API = 'http://localhost:5000/api/v1';

const PYTHON_SAMPLE = `def calculate_grade(score):
    if score >= 90:
        return 'A'
    elif score >= 80:
        return 'B'
    else:
        return 'F'

def get_grade(points):
    if points >= 90:
        return 'A'
    elif points >= 80:
        return 'B'
    else:
        return 'F'`;

const JAVA_SAMPLE = `public class GradeCalculator {
    public String calculateGrade(int score) {
        if (score >= 90) return "A";
        else if (score >= 80) return "B";
        else return "F";
    }

    public String getGrade(int points) {
        if (points >= 90) return "A";
        else if (points >= 80) return "B";
        else return "F";
    }
}`;

function CodeAnalyzer() {
  const [language, setLanguage] = useState(() => {
    const scanName = localStorage.getItem('scanFileName');
    if (scanName) {
      const ext = scanName.split('.').pop().toLowerCase();
      if (ext === 'py') return 'python';
      if (ext === 'java') return 'java';
    }
    return 'python';
  });
  const [code, setCode] = useState(() => {
    const scanContent = localStorage.getItem('scanFileContent');
    return scanContent || PYTHON_SAMPLE;
  });
  const [quickResult, setQuickResult] = useState({ text: '', className: '' });
  const [analyzeResult, setAnalyzeResult] = useState({ text: '', className: '' });
  const [analysisData, setAnalysisData] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState(() => {
    return localStorage.getItem('scanFileContent') ? (localStorage.getItem('scanFileName') || '') : '';
  });
  const [batchFiles, setBatchFiles] = useState([]);
  const [batchSuggestions, setBatchSuggestions] = useState([]);
  const [showHelp, setShowHelp] = useState(false);
  const fileInputRef = useRef(null);
  const zipInputRef = useRef(null);
  const navigate = useNavigate();

  // Get user info from localStorage for sidebar
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : { username: 'User', email: 'user@email.com', full_name: 'User' };

  useEffect(() => {
    // Clean up scan data after initializing from it
    localStorage.removeItem('scanFileContent');
    localStorage.removeItem('scanFileName');
  }, []);

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

  async function testHealth() {
    setQuickResult({ text: 'Testing...', className: 'loading' });
    try {
      const res = await fetch(`${API}/health`);
      const data = await res.json();
      setQuickResult({ text: JSON.stringify(data, null, 2), className: 'success' });
    } catch (error) {
      setQuickResult({ text: `Error: ${error.message}`, className: 'error' });
    }
  }

  async function testLanguages() {
    setQuickResult({ text: 'Testing...', className: 'loading' });
    try {
      const res = await fetch(`${API}/languages`);
      const data = await res.json();
      setQuickResult({ text: JSON.stringify(data, null, 2), className: 'success' });
    } catch (error) {
      setQuickResult({ text: `Error: ${error.message}`, className: 'error' });
    }
  }

  function loadSample() {
    setCode(language === 'python' ? PYTHON_SAMPLE : JAVA_SAMPLE);
    setUploadedFileName('');
  }

  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setCode(event.target.result);
      setUploadedFileName(file.name);

      if (file.name.includes('.')) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'py') setLanguage('python');
        else if (ext === 'java') setLanguage('java');
      }
    };
    reader.readAsText(file);
  }

  async function handleZipUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileEntry = {
      name: file.name,
      size: (file.size / 1024).toFixed(1) + ' KB',
      type: 'zip',
      uploadedAt: new Date().toLocaleString(),
    };
    setBatchFiles(prev => [...prev, fileEntry]);
    setUploadedFileName(file.name);

    const userId = user.id || user.username || 'default';
    const historyKey = `activityHistory_${userId}`;

    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(file);
      const extractedFiles = [];

      for (const [fileName, zipEntry] of Object.entries(contents.files)) {
        if (zipEntry.dir) continue;
        const ext = fileName.split('.').pop().toLowerCase();
        if (['py', 'java', 'txt'].includes(ext)) {
          const content = await zipEntry.async('text');
          extractedFiles.push({ name: fileName, content, ext });
        }
      }

      if (extractedFiles.length === 0) {
        setBatchSuggestions([{ type: 'No Code Files', description: 'No .py, .java, or .txt files found in the zip', severity: 'medium', files: 0 }]);
        return;
      }

      // Load sections to match filenames to students
      const savedSections = localStorage.getItem('savedSections');
      const sections = savedSections ? JSON.parse(savedSections) : [];
      const allStudents = sections.flatMap(s => s.students);

      const results = [];
      const suggestions = [];

      for (const ef of extractedFiles) {
        // Try to match filename to a student name or email
        const baseName = ef.name.split('/').pop().replace(/\.(py|java|txt)$/i, '').toLowerCase().replace(/[_-]/g, ' ');
        const matchedStudent = allStudents.find(st =>
          st.name.toLowerCase().includes(baseName) ||
          baseName.includes(st.name.toLowerCase().split(' ')[0]) ||
          st.email.toLowerCase().split('@')[0] === baseName.replace(/\s/g, '')
        );

        // Analyze the extracted code
        try {
          const lang = ef.ext === 'py' ? 'python' : ef.ext === 'java' ? 'java' : 'python';
          const res = await fetch(`${API}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: ef.content, language: lang }),
          });

          if (res.ok) {
            const data = await res.json();
            results.push({
              fileName: ef.name,
              studentName: matchedStudent ? matchedStudent.name : null,
              studentEmail: matchedStudent ? matchedStudent.email : null,
              clonePercentage: data.clone_percentage,
              complexity: data.cyclomatic_complexity,
              maintainability: data.maintainability_index,
              date: new Date().toLocaleDateString(),
            });

            if (data.clone_percentage > 30) {
              suggestions.push({
                type: 'High Clone %',
                description: `${ef.name}${matchedStudent ? ` (${matchedStudent.name})` : ''}: ${data.clone_percentage}% clone detected`,
                severity: data.clone_percentage > 50 ? 'high' : 'medium',
                files: 1,
              });
            }
          }
        } catch {
          results.push({
            fileName: ef.name,
            studentName: matchedStudent ? matchedStudent.name : null,
            studentEmail: matchedStudent ? matchedStudent.email : null,
            clonePercentage: 0,
            complexity: 'N/A',
            maintainability: 'N/A',
            date: new Date().toLocaleDateString(),
          });
        }
      }

      // Store results so students can see them
      const existingResults = JSON.parse(localStorage.getItem('studentResults') || '[]');
      localStorage.setItem('studentResults', JSON.stringify([...results, ...existingResults]));

      if (suggestions.length === 0) {
        suggestions.push({ type: 'All Clear', description: `All ${extractedFiles.length} files have acceptable clone levels`, severity: 'low', files: extractedFiles.length });
      }
      setBatchSuggestions(suggestions);

      // Log to history
      const historyEntries = JSON.parse(localStorage.getItem(historyKey) || '[]');
      historyEntries.unshift({
        id: Date.now(),
        type: 'upload',
        icon: '📤',
        description: `Uploaded batch: ${file.name} - ${extractedFiles.length} files extracted and analyzed`,
        time: new Date().toISOString(),
        status: 'success'
      });
      localStorage.setItem(historyKey, JSON.stringify(historyEntries));

    } catch (err) {
      setBatchSuggestions([{ type: 'Error', description: `Failed to read zip: ${err.message}`, severity: 'high', files: 0 }]);
      
      const historyEntries = JSON.parse(localStorage.getItem(historyKey) || '[]');
      historyEntries.unshift({
        id: Date.now(),
        type: 'upload',
        icon: '📤',
        description: `Upload failed: ${file.name} - ${err.message}`,
        time: new Date().toISOString(),
        status: 'warning'
      });
      localStorage.setItem(historyKey, JSON.stringify(historyEntries));
    }
  }

  async function analyze() {
    if (!code.trim()) {
      alert('Please enter some code!');
      return;
    }

    setAnalyzeResult({ text: 'Analyzing...', className: 'loading' });
    setAnalysisData(null);

    try {
      const res = await fetch(`${API}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
      });

      const data = await res.json();

      if (res.ok) {
        setAnalysisData(data);
        setAnalyzeResult({ text: '', className: 'success' });

        const userId = user.id || user.username || 'default';
        const historyKey = `activityHistory_${userId}`;
        const historyEntries = JSON.parse(localStorage.getItem(historyKey) || '[]');
        historyEntries.unshift({
          id: Date.now(),
          type: 'analysis',
          icon: '🔍',
          description: `Analyzed ${language} code - ${data.clone_percentage}% clone detected`,
          time: new Date().toISOString(),
          status: data.clone_percentage > 30 ? 'warning' : 'success'
        });
        localStorage.setItem(historyKey, JSON.stringify(historyEntries));
      } else {
        setAnalyzeResult({ text: JSON.stringify(data, null, 2), className: 'error' });
      }
    } catch (error) {
      setAnalyzeResult({ text: `Error: ${error.message}`, className: 'error' });
    }
  }

  function getClonePercentageClass(pct) {
    if (pct > 50) return 'high';
    if (pct > 25) return 'medium';
    return 'low';
  }

  function getComplexityClass(val) {
    if (val > 20) return 'high';
    if (val > 10) return 'medium';
    return 'low';
  }

  function getMaintainabilityClass(val) {
    if (val >= 60) return 'good';
    if (val >= 30) return 'medium';
    return 'low';
  }

  return (
    <div className="analyzer-layout">
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
          <button className="nav-item active">
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
          <button className="nav-item" onClick={() => navigate('/settings')}>
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
        <header className="analyzer-header">
          <div className="header-left">
            <h2 className="page-title">Code Clone Detector</h2>
            <p className="page-subtitle">Analyze your code for duplicates and get refactoring suggestions</p>
          </div>
        </header>

        <div className="analyzer-content">
          {/* Quick Tests Section */}
          <section className="analyzer-section">
            <h3 className="section-title">Quick Tests</h3>
            <div className="quick-test-buttons">
              <button className="test-btn" onClick={testHealth}>
                <span className="btn-icon">🏥</span>
                Health Check
              </button>
              <button className="test-btn" onClick={testLanguages}>
                <span className="btn-icon">💻</span>
                Get Languages
              </button>
            </div>
            {quickResult.text && (
              <div className={`result-box ${quickResult.className}`}>
                <pre>{quickResult.text}</pre>
              </div>
            )}
          </section>

          {/* Code Analysis Section */}
          <section className="analyzer-section">
            <h3 className="section-title">Analyze Code</h3>
            
            <div className="controls-row">
              <div className="control-group">
                <label className="control-label">Language</label>
                <select 
                  className="language-select" 
                  value={language} 
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="python">Python</option>
                  <option value="java">Java</option>
                </select>
              </div>

              <button className="action-btn secondary" onClick={loadSample}>
                <span className="btn-icon">📝</span>
                Load Sample
              </button>

              <button className="action-btn secondary" onClick={() => fileInputRef.current.click()}>
                <span className="btn-icon">📤</span>
                Upload File
              </button>
              <button className="action-btn secondary" aria-label="Upload zip file" onClick={() => zipInputRef.current.click()}>
                <span className="btn-icon">📦</span>
                Upload Zip
              </button>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept=".py,.java,.txt"
                onChange={handleFileUpload}
              />
              <input
                type="file"
                ref={zipInputRef}
                style={{ display: 'none' }}
                accept=".zip"
                onChange={handleZipUpload}
              />
            </div>

            {uploadedFileName && (
              <div className="file-uploaded-badge">
                <span className="badge-icon">✓</span>
                Loaded: {uploadedFileName}
              </div>
            )}

            {batchFiles.length > 0 && (
              <div className="batch-files-list">
                <h4 className="batch-title">📦 Batch Files ({batchFiles.length})</h4>
                {batchFiles.map((f, i) => (
                  <div key={i} className="batch-file-item">
                    <span className="batch-file-name">{f.name}</span>
                    <span className="batch-file-size">{f.size}</span>
                    <span className="batch-file-time">{f.uploadedAt}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="code-editor-container">
              <div className="editor-header">
                <span className="editor-label">Code Editor</span>
                <span className="editor-lang">{language === 'python' ? 'Python' : 'Java'}</span>
              </div>
              <textarea
                className="code-editor"
                value={code}
                onChange={(e) => { 
                  setCode(e.target.value); 
                  setUploadedFileName(''); 
                }}
                placeholder="Paste your code here or upload a file..."
              />
            </div>

            <button className="action-btn primary analyze-btn" onClick={analyze}>
              <span className="btn-icon">🔍</span>
              Analyze Code
            </button>

            {analyzeResult.className === 'loading' && (
              <div className="result-box loading">
                <pre>Analyzing...</pre>
              </div>
            )}

            {analyzeResult.className === 'error' && analyzeResult.text && (
              <div className="result-box error">
                <pre>{analyzeResult.text}</pre>
              </div>
            )}

            {analysisData && (
              <div className="analysis-visual-results">
                <div className="result-header">
                  <span className="result-title">Analysis Results</span>
                  <span className="result-time">{analysisData.execution_time_ms}ms</span>
                </div>

                {/* Metric Graphs */}
                <div className="metrics-grid">
                  <div className="metric-card">
                    <div className="metric-label">Clone Percentage</div>
                    <div className="metric-bar-container">
                      <div
                        className={`metric-bar-fill ${getClonePercentageClass(analysisData.clone_percentage)}`}
                        style={{ width: `${Math.min(analysisData.clone_percentage, 100)}%` }}
                      />
                    </div>
                    <div className="metric-value">{analysisData.clone_percentage}%</div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-label">Cyclomatic Complexity</div>
                    <div className="metric-bar-container">
                      <div
                        className={`metric-bar-fill ${getComplexityClass(analysisData.cyclomatic_complexity)}`}
                        style={{ width: `${Math.min(analysisData.cyclomatic_complexity * 2, 100)}%` }}
                      />
                    </div>
                    <div className="metric-value">{analysisData.cyclomatic_complexity}</div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-label">Maintainability Index</div>
                    <div className="metric-bar-container">
                      <div
                        className={`metric-bar-fill ${getMaintainabilityClass(analysisData.maintainability_index)}`}
                        style={{ width: `${Math.min(analysisData.maintainability_index, 100)}%` }}
                      />
                    </div>
                    <div className="metric-value">{analysisData.maintainability_index}/100</div>
                  </div>
                </div>

                {/* Clones Detected */}
                {analysisData.clones && analysisData.clones.length > 0 && (
                  <div className="clones-section">
                    <h4 className="subsection-title">🔍 Clones Detected ({analysisData.clones.length})</h4>
                    <div className="clones-list">
                      {analysisData.clones.map((clone, i) => (
                        <div key={i} className="clone-card">
                          <div className="clone-header">
                            <span className="clone-type">{clone.type}</span>
                            <span className="clone-similarity">{(clone.similarity * 100).toFixed(1)}%</span>
                          </div>
                          <div className="clone-locations">
                            {clone.locations.map((l, j) => (
                              <span key={j} className="clone-location">Lines {l.start_line}–{l.end_line}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Refactoring Suggestions */}
                {analysisData.refactoring_suggestions && analysisData.refactoring_suggestions.length > 0 && (
                  <div className="suggestions-section">
                    <h4 className="subsection-title">💡 Refactoring Suggestions</h4>
                    <div className="suggestion-cards">
                      {analysisData.refactoring_suggestions.map((sugg, i) => (
                        <div key={i} className="analyzer-suggestion-card">
                          <div className="analyzer-suggestion-type">{sugg.refactoring_type}</div>
                          <div className="analyzer-suggestion-text">{sugg.explanation.remember}</div>
                          <div className="analyzer-suggestion-text">{sugg.explanation.apply}</div>
                        </div>
                      ))}
                    </div>
                    <button className="action-btn primary refactoring-link-btn" onClick={() => navigate('/refactoring')}>
                      <span className="btn-icon">🔄</span>
                      Open in Refactoring Tool
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Batch Upload Refactoring Suggestions */}
            {batchSuggestions.length > 0 && (
              <div className="batch-suggestions">
                <h4 className="subsection-title">🔄 Batch Refactoring Suggestions</h4>
                <div className="batch-suggestion-cards">
                  {batchSuggestions.map((s, i) => (
                    <div key={i} className={`batch-suggestion-card severity-${s.severity}`}>
                      <div className="batch-suggestion-header">
                        <span className="batch-suggestion-type">{s.type}</span>
                        <span className={`severity-badge ${s.severity}`}>{s.severity}</span>
                      </div>
                      <div className="batch-suggestion-desc">{s.description}</div>
                      <div className="batch-suggestion-files">Affects {s.files} file(s)</div>
                    </div>
                  ))}
                </div>
                <button className="action-btn primary refactoring-link-btn" onClick={() => navigate('/refactoring')}>
                  <span className="btn-icon">🔄</span>
                  View Detailed Refactoring
                </button>
              </div>
            )}
          </section>
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

export default CodeAnalyzer;
