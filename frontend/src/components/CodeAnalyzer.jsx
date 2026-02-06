import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState(PYTHON_SAMPLE);
  const [quickResult, setQuickResult] = useState({ text: '', className: '' });
  const [analyzeResult, setAnalyzeResult] = useState({ text: '', className: '' });
  const [uploadedFileName, setUploadedFileName] = useState('');
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  async function testHealth() {
    setQuickResult({ text: 'Testing...', className: 'result loading' });
    try {
      const res = await fetch(`${API}/health`);
      const data = await res.json();
      setQuickResult({ text: JSON.stringify(data, null, 2), className: 'result success' });
    } catch (error) {
      setQuickResult({ text: `Error: ${error.message}`, className: 'result error' });
    }
  }

  async function testLanguages() {
    setQuickResult({ text: 'Testing...', className: 'result loading' });
    try {
      const res = await fetch(`${API}/languages`);
      const data = await res.json();
      setQuickResult({ text: JSON.stringify(data, null, 2), className: 'result success' });
    } catch (error) {
      setQuickResult({ text: `Error: ${error.message}`, className: 'result error' });
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

  async function analyze() {
    if (!code.trim()) {
      alert('Please enter some code!');
      return;
    }

    setAnalyzeResult({ text: 'Analyzing...', className: 'result loading' });

    try {
      const res = await fetch(`${API}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
      });

      const data = await res.json();

      if (res.ok) {
        let output = '\u{1F4CA} METRICS\n';
        output += `Clone Percentage: ${data.clone_percentage}%\n`;
        output += `Complexity: ${data.cyclomatic_complexity}\n`;
        output += `Maintainability: ${data.maintainability_index}\n`;
        output += `Execution Time: ${data.execution_time_ms}ms\n\n`;

        if (data.clones && data.clones.length > 0) {
          output += `\u{1F50D} CLONES DETECTED: ${data.clones.length}\n\n`;
          data.clones.forEach((clone, i) => {
            output += `Clone #${i + 1}:\n`;
            output += `  Type: ${clone.type}\n`;
            output += `  Similarity: ${(clone.similarity * 100).toFixed(1)}%\n`;
            output += `  Locations: ${clone.locations.map((l) => `lines ${l.start_line}-${l.end_line}`).join(', ')}\n\n`;
          });
        }

        if (data.refactoring_suggestions && data.refactoring_suggestions.length > 0) {
          output += `\u{1F4A1} SUGGESTIONS: ${data.refactoring_suggestions.length}\n\n`;
          data.refactoring_suggestions.forEach((sugg, i) => {
            output += `Suggestion #${i + 1}: ${sugg.refactoring_type}\n`;
            output += `  ${sugg.explanation.remember}\n`;
            output += `  ${sugg.explanation.apply}\n\n`;
          });
        }

        output += '\n' + '='.repeat(50) + '\n';
        output += 'RAW JSON:\n';
        output += JSON.stringify(data, null, 2);

        setAnalyzeResult({ text: output, className: 'result success' });
      } else {
        setAnalyzeResult({ text: JSON.stringify(data, null, 2), className: 'result error' });
      }
    } catch (error) {
      setAnalyzeResult({ text: `Error: ${error.message}`, className: 'result error' });
    }
  }

  return (
    <div className="analyzer-container">
      <div className="analyzer-nav">
        <button className="nav-btn" onClick={() => navigate('/dashboard')}>Dashboard</button>
      </div>

      <h1>Code Clone Detector</h1>

      <div className="section">
        <h2>Quick Tests</h2>
        <button onClick={testHealth}>Health Check</button>
        <button onClick={testLanguages}>Get Languages</button>
        {quickResult.text && (
          <div className={quickResult.className}>{quickResult.text}</div>
        )}
      </div>

      <div className="section">
        <h2>Analyze Code</h2>

        <div className="analyzer-controls">
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="python">Python</option>
            <option value="java">Java</option>
          </select>

          <button onClick={loadSample}>Load Sample Code</button>

          <button onClick={() => fileInputRef.current.click()}>Upload File</button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".py,.java,.txt"
            onChange={handleFileUpload}
          />
        </div>

        {uploadedFileName && (
          <div className="uploaded-file-info">Loaded file: {uploadedFileName}</div>
        )}

        <textarea
          value={code}
          onChange={(e) => { setCode(e.target.value); setUploadedFileName(''); }}
          placeholder="Paste your code here or upload a file..."
        />

        <button onClick={analyze}>Analyze Code</button>

        {analyzeResult.text && (
          <div className={analyzeResult.className}>{analyzeResult.text}</div>
        )}
      </div>
    </div>
  );
}

export default CodeAnalyzer;
