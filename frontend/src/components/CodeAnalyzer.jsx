import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import Logo from './Logo';
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

function highlightCode(code, language) {
  if (!code) return '';

  const pythonKeywords = ['def', 'class', 'if', 'elif', 'else', 'for', 'while', 'return', 'import', 'from', 'as', 'try', 'except', 'finally', 'with', 'yield', 'lambda', 'pass', 'break', 'continue', 'and', 'or', 'not', 'in', 'is', 'True', 'False', 'None', 'print', 'self', 'raise', 'del', 'global', 'nonlocal', 'assert'];
  const javaKeywords = ['public', 'private', 'protected', 'static', 'final', 'class', 'interface', 'extends', 'implements', 'void', 'int', 'double', 'float', 'boolean', 'String', 'char', 'long', 'short', 'byte', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'return', 'new', 'this', 'super', 'try', 'catch', 'finally', 'throw', 'throws', 'import', 'package', 'null', 'true', 'false', 'abstract', 'synchronized'];

  const keywords = language === 'python' ? pythonKeywords : javaKeywords;
  const keywordPattern = new RegExp('\\b(' + keywords.join('|') + ')\\b', 'g');

  // Process line by line, token by token
  return code.split('\n').map(line => {
    let esc = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const trimmed = esc.trimStart();

    // Full-line comments
    if (language === 'python' && trimmed.startsWith('#'))
      return '<span class="syntax-comment">' + esc + '</span>';
    if (language !== 'python' && trimmed.startsWith('//'))
      return '<span class="syntax-comment">' + esc + '</span>';

    // Split into string tokens and code tokens to avoid highlighting inside strings
    const parts = [];
    let rest = esc;
    const strRe = /(["'])(?:(?=(\\?))\2.)*?\1/;
    while (rest) {
      const m = rest.match(strRe);
      if (!m) { parts.push({ t: 'c', v: rest }); break; }
      if (m.index > 0) parts.push({ t: 'c', v: rest.slice(0, m.index) });
      parts.push({ t: 's', v: m[0] });
      rest = rest.slice(m.index + m[0].length);
    }

    return parts.map(p => {
      if (p.t === 's') return '<span class="syntax-string">' + p.v + '</span>';
      let s = p.v;
      // Keywords first (before numbers to avoid matching inside keyword spans)
      s = s.replace(keywordPattern, '\x01KW\x02$1\x01/KW\x02');
      // Numbers
      s = s.replace(/\b(\d+\.?\d*)\b/g, '\x01NM\x02$1\x01/NM\x02');
      // Function calls
      s = s.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, '\x01FN\x02$1\x01/FN\x02');
      // Replace markers with actual span tags
      s = s.replace(/\x01KW\x02/g, '<span class="syntax-keyword">').replace(/\x01\/KW\x02/g, '</span>');
      s = s.replace(/\x01NM\x02/g, '<span class="syntax-number">').replace(/\x01\/NM\x02/g, '</span>');
      s = s.replace(/\x01FN\x02/g, '<span class="syntax-function">').replace(/\x01\/FN\x02/g, '</span>');
      return s;
    }).join('');
  }).join('\n');
}

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
  const [extractedFiles, setExtractedFiles] = useState([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [sections] = useState(() => {
    const savedSections = localStorage.getItem('savedSections');
    return savedSections ? JSON.parse(savedSections) : [];
  });
  const [showHelp, setShowHelp] = useState(false);
  const fileInputRef = useRef(null);
  const zipInputRef = useRef(null);
  const navigate = useNavigate();

  // Get user info from localStorage for sidebar
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : { username: 'User', email: 'user@email.com', full_name: 'User' };
  const profilePic = user ? localStorage.getItem('profilePicture_' + user.id) : null;

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

  function getSectionName(sectionId) {
    if (!sectionId) return '';
    const s = sections.find(sec => sec.id?.toString() === sectionId || sec.name === sectionId);
    return s ? s.name : sectionId;
  }

  function getExtractedFileSeverityClass(ef) {
    if (!ef.result) return 'low';
    if (ef.result.clone_percentage > 50) return 'high';
    if (ef.result.clone_percentage > 25) return 'medium';
    return 'low';
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

      // Also add to extractedFiles list for section tracking
      if (selectedSection) {
        const ext = file.name.split('.').pop().toLowerCase();
        setExtractedFiles(prev => [...prev, {
          id: crypto.randomUUID(),
          name: file.name,
          content: event.target.result,
          ext,
          lang: ext === 'py' ? 'python' : ext === 'java' ? 'java' : 'python',
          analyzed: false,
          result: null,
          section: selectedSection,
        }]);
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
      const newExtractedFiles = [];

      for (const [fileName, zipEntry] of Object.entries(contents.files)) {
        if (zipEntry.dir) continue;
        const ext = fileName.split('.').pop().toLowerCase();
        if (['py', 'java', 'txt'].includes(ext)) {
          const content = await zipEntry.async('text');
          newExtractedFiles.push({
            id: crypto.randomUUID(),
            name: fileName,
            content,
            ext,
            lang: ext === 'py' ? 'python' : ext === 'java' ? 'java' : 'python',
            analyzed: false,
            result: null,
            section: selectedSection,
          });
        }
      }

      if (newExtractedFiles.length === 0) {
        setBatchSuggestions([{ type: 'No Code Files', description: 'No .py, .java, or .txt files found in the zip', severity: 'medium', files: 0 }]);
        return;
      }

      setExtractedFiles(prev => [...prev, ...newExtractedFiles]);

      // Log to history
      const historyEntries = JSON.parse(localStorage.getItem(historyKey) || '[]');
      historyEntries.unshift({
        id: Date.now(),
        type: 'upload',
        icon: '',
        description: `Uploaded batch: ${file.name} - ${newExtractedFiles.length} files extracted${selectedSection ? ` (Section: ${getSectionName(selectedSection)})` : ''}`,
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
        icon: '',
        description: `Upload failed: ${file.name} - ${err.message}`,
        time: new Date().toISOString(),
        status: 'warning'
      });
      localStorage.setItem(historyKey, JSON.stringify(historyEntries));
    }
  }

  function handleSelectExtractedFile(ef) {
    setCode(ef.content);
    setLanguage(ef.lang);
    setUploadedFileName(ef.name);
    setAnalysisData(ef.result);
    setAnalyzeResult(ef.result ? { text: '', className: 'success' } : { text: '', className: '' });
  }

  async function handleAnalyzeExtractedFile(ef) {
    // Load the file into the editor
    setCode(ef.content);
    setLanguage(ef.lang);
    setUploadedFileName(ef.name);
    setAnalysisData(null);
    setAnalyzeResult({ text: 'Analyzing...', className: 'loading' });

    try {
      const res = await fetch(`${API}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: ef.content, language: ef.lang }),
      });

      const data = await res.json();

      if (res.ok) {
        setAnalysisData(data);
        setAnalyzeResult({ text: '', className: 'success' });

        // Update the extracted file with results
        setExtractedFiles(prev => prev.map(f =>
          f.id === ef.id ? { ...f, analyzed: true, result: data } : f
        ));

        // Load sections to match filenames to students
        const savedSections = localStorage.getItem('savedSections');
        const sectionsList = savedSections ? JSON.parse(savedSections) : [];
        const targetSection = ef.section
          ? sectionsList.find(s => s.id?.toString() === ef.section || s.name === ef.section)
          : null;
        const allStudents = targetSection ? targetSection.students : sectionsList.flatMap(s => s.students);

        const baseName = ef.name.split('/').pop().replace(/\.(py|java|txt)$/i, '').toLowerCase().replace(/[_-]/g, ' ');
        const matchedStudent = allStudents.find(st =>
          st.name.toLowerCase().includes(baseName) ||
          baseName.includes(st.name.toLowerCase().split(' ')[0]) ||
          st.email.toLowerCase().split('@')[0] === baseName.replace(/\s/g, '')
        );

        // Store result so students can see them
        const studentResult = {
          fileName: ef.name,
          studentName: matchedStudent ? matchedStudent.name : null,
          studentEmail: matchedStudent ? matchedStudent.email : null,
          clonePercentage: data.clone_percentage,
          complexity: data.cyclomatic_complexity,
          maintainability: data.maintainability_index,
          date: new Date().toLocaleDateString(),
          section: ef.section || null,
        };
        const existingResults = JSON.parse(localStorage.getItem('studentResults') || '[]');
        localStorage.setItem('studentResults', JSON.stringify([studentResult, ...existingResults]));

        // Check for high clone and add to batch suggestions
        if (data.clone_percentage > 30) {
          setBatchSuggestions(prev => {
            const filtered = prev.filter(s => s.fileId !== ef.id);
            return [...filtered, {
              type: 'High Clone %',
              description: `${ef.name}${matchedStudent ? ` (${matchedStudent.name})` : ''}: ${data.clone_percentage}% clone detected`,
              severity: data.clone_percentage > 50 ? 'high' : 'medium',
              files: 1,
              fileId: ef.id,
            }];
          });
        }

        const userId = user.id || user.username || 'default';
        const historyKey = `activityHistory_${userId}`;
        const historyEntries = JSON.parse(localStorage.getItem(historyKey) || '[]');
        historyEntries.unshift({
          id: Date.now(),
          type: 'analysis',
          icon: '',
          description: `Analyzed ${ef.lang} file: ${ef.name} - ${data.clone_percentage}% clone detected`,
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
          icon: '',
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
          <Logo />
        </div>
        
        <nav className="sidebar-nav">
          <button className="nav-item" onClick={() => navigate('/dashboard')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></span>
            Dashboard
          </button>
          <button className="nav-item active">
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
        <header className="analyzer-header">
          <div className="header-left">
            <h2 className="page-title">Code Analyzer</h2>
            <p className="page-subtitle">Analyze code for duplicates and get refactoring suggestions</p>
          </div>
        </header>

        <div className="analyzer-content">
          {/* Quick Tests Section */}
          <section className="analyzer-section">
            <h3 className="section-title">Quick Tests</h3>
            <div className="quick-test-buttons">
              <button className="test-btn" onClick={testHealth}>
                <span className="btn-icon">+</span>
                Health Check
              </button>
              <button className="test-btn" onClick={testLanguages}>
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

              <div className="control-group">
                <label className="control-label">Section</label>
                <select
                  className="language-select"
                  value={selectedSection}
                  onChange={(e) => setSelectedSection(e.target.value)}
                >
                  <option value="">No Section</option>
                  {sections.map((s) => (
                    <option key={s.id || s.name} value={s.id?.toString() || s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <button className="action-btn secondary" onClick={loadSample}>
                Load Sample
              </button>

              <button className="action-btn secondary" onClick={() => fileInputRef.current.click()}>
                Upload File
              </button>
              <button className="action-btn secondary" aria-label="Upload zip file" onClick={() => zipInputRef.current.click()}>
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
                <h4 className="batch-title">Batch Files ({batchFiles.length})</h4>
                {batchFiles.map((f, i) => (
                  <div key={i} className="batch-file-item">
                    <span className="batch-file-name">{f.name}</span>
                    <span className="batch-file-size">{f.size}</span>
                    <span className="batch-file-time">{f.uploadedAt}</span>
                  </div>
                ))}
              </div>
            )}

            {extractedFiles.length > 0 && (
              <div className="batch-files-list">
                <h4 className="batch-title">Extracted Files ({extractedFiles.length}) — Select a file to scan individually</h4>
                {extractedFiles.map((ef) => (
                  <div key={ef.id} className={`batch-file-item ${uploadedFileName === ef.name ? 'batch-file-active' : ''}`}>
                    <span className="batch-file-icon">{ef.ext === 'py' ? 'PY' : ef.ext === 'java' ? 'JV' : 'TXT'}</span>
                    <span className="batch-file-name">{ef.name.split('/').pop()}</span>
                    <span className="batch-file-size">{ef.lang}</span>
                    {ef.section && (
                      <span className="batch-file-section">
                        {getSectionName(ef.section)}
                      </span>
                    )}
                    {ef.analyzed && (
                      <span className={`severity-badge ${getExtractedFileSeverityClass(ef)}`}>
                        {ef.result ? `${ef.result.clone_percentage}%` : 'Done'}
                      </span>
                    )}
                    <button className="action-btn secondary batch-file-btn" onClick={() => handleSelectExtractedFile(ef)}>
                      View
                    </button>
                    <button className="action-btn primary batch-file-btn" onClick={() => handleAnalyzeExtractedFile(ef)}>
                      {ef.analyzed ? 'Re-scan' : 'Scan'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Per-Section Analytics */}
            {(() => {
              const analyzedWithSection = extractedFiles.filter(f => f.analyzed && f.section && f.result);
              if (analyzedWithSection.length === 0) return null;
              const sectionMap = {};
              analyzedWithSection.forEach(f => {
                const sName = getSectionName(f.section) || f.section;
                if (!sectionMap[sName]) sectionMap[sName] = [];
                sectionMap[sName].push(f);
              });
              return (
                <div className="section-analytics">
                  <h4 className="subsection-title">Section Analytics</h4>
                  <div className="section-analytics-grid">
                    {Object.entries(sectionMap).map(([sName, files]) => {
                      const avgClone = (files.reduce((sum, f) => sum + (f.result.clone_percentage || 0), 0) / files.length).toFixed(1);
                      const avgComplexity = (files.reduce((sum, f) => sum + (f.result.cyclomatic_complexity || 0), 0) / files.length).toFixed(1);
                      const avgMaint = (files.reduce((sum, f) => sum + (f.result.maintainability_index || 0), 0) / files.length).toFixed(1);
                      const highClone = files.filter(f => f.result.clone_percentage > 30).length;
                      return (
                        <div key={sName} className="section-analytics-card">
                          <div className="section-analytics-header">{sName}</div>
                          <div className="section-analytics-stats">
                            <div className="section-stat">
                              <span className="section-stat-label">Files</span>
                              <span className="section-stat-value">{files.length}</span>
                            </div>
                            <div className="section-stat">
                              <span className="section-stat-label">Avg Clone</span>
                              <span className={`section-stat-value ${avgClone > 30 ? 'high' : avgClone > 15 ? 'medium' : 'low'}`}>{avgClone}%</span>
                            </div>
                            <div className="section-stat">
                              <span className="section-stat-label">Avg Complexity</span>
                              <span className="section-stat-value">{avgComplexity}</span>
                            </div>
                            <div className="section-stat">
                              <span className="section-stat-label">Avg Maintainability</span>
                              <span className="section-stat-value">{avgMaint}/100</span>
                            </div>
                            {highClone > 0 && (
                              <div className="section-stat">
                                <span className="section-stat-label">High Clone Files</span>
                                <span className="section-stat-value high">{highClone}</span>
                              </div>
                            )}
                          </div>
                          <div className="section-file-list">
                            {files.map(f => (
                              <div key={f.id} className="section-file-row">
                                <span className="section-file-name">{f.name.split('/').pop()}</span>
                                <span className={`severity-badge ${getExtractedFileSeverityClass(f)}`}>{f.result.clone_percentage}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className="code-editor-container">
              <div className="editor-header">
                <span className="editor-label">Code Editor</span>
                <span className="editor-lang">{language === 'python' ? 'Python' : 'Java'}</span>
              </div>
              <div className="editor-body">
                <pre
                  className="code-highlight"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: highlightCode(code, language) + '\n' }}
                />
                <textarea
                  className="code-editor"
                  value={code}
                  onChange={(e) => { 
                    setCode(e.target.value); 
                    setUploadedFileName(''); 
                  }}
                  placeholder="Paste your code here or upload a file..."
                  spellCheck="false"
                />
              </div>
            </div>

            <button className="action-btn primary analyze-btn" onClick={analyze}>
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
                    <h4 className="subsection-title">Clones Detected ({analysisData.clones.length})</h4>
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
                    <h4 className="subsection-title">Refactoring Suggestions</h4>
                    <div className="suggestion-cards">
                      {analysisData.refactoring_suggestions.map((sugg, i) => (
                        <div key={i} className="analyzer-suggestion-card">
                          <div className="analyzer-suggestion-type">{sugg.refactoring_type}</div>
                          <div className="analyzer-suggestion-text">{sugg.explanation.remember}</div>
                          <div className="analyzer-suggestion-text">{sugg.explanation.apply}</div>
                        </div>
                      ))}
                    </div>
                    <button className="action-btn primary refactoring-link-btn" onClick={() => {
                      localStorage.setItem('refactoringCode', code);
                      localStorage.setItem('refactoringLanguage', language);
                      navigate('/refactoring');
                    }}>
                      Open in Refactoring Tool
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Batch Upload Refactoring Suggestions */}
            {batchSuggestions.length > 0 && (
              <div className="batch-suggestions">
                <h4 className="subsection-title">Batch Refactoring Suggestions</h4>
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
                <button className="action-btn primary refactoring-link-btn" onClick={() => {
                  localStorage.setItem('refactoringCode', code);
                  localStorage.setItem('refactoringLanguage', language);
                  navigate('/refactoring');
                }}>
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

export default CodeAnalyzer;
