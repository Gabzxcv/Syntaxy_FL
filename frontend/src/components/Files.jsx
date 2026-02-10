import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from './Logo';
import './Files.css';

const API = 'http://localhost:5000/api/v1';

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
}

function getFileType(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  if (ext === 'zip') return 'zip';
  if (ext === 'java') return 'java';
  if (ext === 'py') return 'python';
  if (ext === 'txt') return 'text';
  return 'text';
}

function getFileIcon(type) {
  switch (type) {
    case 'zip': return '📦';
    case 'java': return '☕';
    case 'python': return '🐍';
    case 'text': return '📄';
    default: return '📄';
  }
}

function getTypeLabel(type) {
  switch (type) {
    case 'zip': return 'ZIP';
    case 'java': return 'Java';
    case 'python': return 'Python';
    case 'text': return 'Text';
    default: return 'File';
  }
}

function formatSize(bytes) {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

function Files() {
  const [files, setFiles] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [dragOver, setDragOver] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : { username: 'User', email: 'user@email.com', full_name: 'User' };

  // Load files from backend on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    fetch(`${API}/auth/files`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401 || res.status === 422) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          navigate('/login');
          return null;
        }
        if (!res.ok) throw new Error('Failed to fetch files');
        return res.json();
      })
      .then((data) => {
        if (data && data.files) {
          // Convert backend files to frontend format
          const formattedFiles = data.files.map((f) => ({
            id: f.id,
            name: f.name,
            size: f.size,
            type: f.file_type,
            date: formatDate(f.created_at),
            preview: f.content ? f.content.split('\n').slice(0, 5).join('\n') : null,
            fullContent: f.content || null,
          }));
          setFiles(formattedFiles);
        }
      })
      .catch((err) => {
        console.error('Error loading files:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [navigate]);

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

  const filteredFiles = files.filter((f) => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || f.type === filterType;
    return matchesSearch && matchesType;
  });

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const uniqueTypes = new Set(files.map((f) => f.type)).size;

  function handleFileUpload(selectedFiles) {
    if (!selectedFiles || selectedFiles.length === 0) return;
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    Array.from(selectedFiles).forEach((file) => {
      const type = getFileType(file.name);
      
      if (type !== 'zip') {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target.result;
          
          // Save to backend
          fetch(`${API}/auth/files`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              name: file.name,
              size: file.size,
              file_type: type,
              content: content,
            }),
          })
            .then((res) => {
              if (!res.ok) throw new Error('Failed to upload file');
              return res.json();
            })
            .then((data) => {
              if (data && data.file) {
                // Add to local state
                const newFile = {
                  id: data.file.id,
                  name: data.file.name,
                  size: data.file.size,
                  type: data.file.file_type,
                  date: formatDate(data.file.created_at),
                  preview: content.split('\n').slice(0, 5).join('\n'),
                  fullContent: content,
                };
                setFiles((prev) => [newFile, ...prev]);
                
                // Add to history
                addToHistory('upload', `Uploaded file: ${file.name} - 1 file processed`);
              }
            })
            .catch((err) => {
              console.error('Error uploading file:', err);
              alert('Failed to upload file. Please try again.');
            });
        };
        reader.readAsText(file);
      } else {
        // For zip files, just save metadata
        fetch(`${API}/auth/files`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            file_type: type,
            content: '',
          }),
        })
          .then((res) => {
            if (!res.ok) throw new Error('Failed to upload file');
            return res.json();
          })
          .then((data) => {
            if (data && data.file) {
              const newFile = {
                id: data.file.id,
                name: data.file.name,
                size: data.file.size,
                type: data.file.file_type,
                date: formatDate(data.file.created_at),
                preview: null,
                fullContent: null,
              };
              setFiles((prev) => [newFile, ...prev]);
              
              // Add to history
              addToHistory('upload', `Uploaded file: ${file.name} - 1 file processed`);
            }
          })
          .catch((err) => {
            console.error('Error uploading file:', err);
            alert('Failed to upload file. Please try again.');
          });
      }
    });
  }

  function addToHistory(type, description) {
    const token = localStorage.getItem('token');
    if (!token) return;

    fetch(`${API}/auth/activity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: type,
        description: description,
      }),
    }).catch((err) => console.error('Error adding to history:', err));
  }

  function handleInputChange(e) {
    handleFileUpload(e.target.files);
    e.target.value = '';
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  }

  function handleDragOver(e) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDelete(id) {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    fetch(`${API}/auth/files/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to delete file');
        setFiles((prev) => prev.filter((f) => f.id !== id));
        if (previewFile && previewFile.id === id) setPreviewFile(null);
      })
      .catch((err) => {
        console.error('Error deleting file:', err);
        alert('Failed to delete file. Please try again.');
      });
  }

  function handleView(file) {
    if (file.preview) {
      setPreviewFile(previewFile && previewFile.id === file.id ? null : file);
    }
  }

  function handleDownload(file) {
    const blob = new Blob([file.preview || `Mock content of ${file.name}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleScan(file) {
    const content = file.fullContent || file.preview;
    if (content) {
      localStorage.setItem('scanFileContent', content);
      localStorage.setItem('scanFileName', file.name);
      
      // Add to history
      addToHistory('analysis', `Scanning ${file.name} for code clones`);
      
      navigate('/analyzer');
    }
  }

  return (
    <div className="files-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <Logo />
        </div>
        <nav className="sidebar-nav">
          <button className="nav-item" onClick={() => navigate('/dashboard')}>
            <span className="nav-icon">📊</span> Dashboard
          </button>
          <button className="nav-item" onClick={() => navigate('/analyzer')}>
            <span className="nav-icon">⚙️</span> Compiler Area
          </button>
          <button className="nav-item active">
            <span className="nav-icon">📁</span> Files
          </button>
          <button className="nav-item" onClick={() => navigate('/students')}>
            <span className="nav-icon">📈</span> Analysis Results
          </button>
          <button className="nav-item" onClick={() => navigate('/refactoring')}>
            <span className="nav-icon">🔄</span> Refactoring
          </button>
          <button className="nav-item" onClick={() => navigate('/history')}>
            <span className="nav-icon">📜</span> History
          </button>
          <button className="nav-item" onClick={() => navigate('/settings')}>
            <span className="nav-icon">⚙️</span> Settings
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

      <div className="main-content">
        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner">Loading files...</div>
          </div>
        ) : (
          <>
            <div className="files-header">
              <div className="header-left">
                <h2 className="page-title">Files</h2>
                <p className="page-subtitle">Manage and organize your uploaded files</p>
              </div>
            </div>

        <div className="files-content">
          {/* Stats Cards */}
          <div className="files-stats">
            <div className="stat-card">
              <div className="stat-icon">📁</div>
              <div className="stat-info">
                <div className="stat-value">{files.length}</div>
                <div className="stat-label">Total Files</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">💾</div>
              <div className="stat-info">
                <div className="stat-value">{formatSize(totalSize)}</div>
                <div className="stat-label">Total Size</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🏷️</div>
              <div className="stat-info">
                <div className="stat-value">{uniqueTypes}</div>
                <div className="stat-label">File Types</div>
              </div>
            </div>
          </div>

          {/* Upload Drop Zone */}
          <div
            className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className="drop-zone-icon">📤</div>
            <div className="drop-zone-text">
              Drag & drop files here, or click to browse
            </div>
            <div className="drop-zone-hint">Supports .zip, .txt, .java, .py files</div>
            <button
              className="upload-btn"
              onClick={() => fileInputRef.current.click()}
            >
              Upload Files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,.txt,.java,.py"
              multiple
              onChange={handleInputChange}
              style={{ display: 'none' }}
            />
          </div>

          {/* Search & Filter */}
          <div className="files-toolbar">
            <div className="search-bar">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="search-input"
                placeholder="Search files by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              className="filter-select"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="all">All Types</option>
              <option value="zip">ZIP</option>
              <option value="java">Java</option>
              <option value="python">Python</option>
              <option value="text">Text</option>
            </select>
          </div>

          {/* File List */}
          <div className="files-list">
            {filteredFiles.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📂</div>
                <div className="empty-text">No files found</div>
              </div>
            ) : (
              filteredFiles.map((file) => (
                <div className="file-row" key={file.id}>
                  <div className="file-icon">{getFileIcon(file.type)}</div>
                  <div className="file-details">
                    <div className="file-name">{file.name}</div>
                    <div className="file-meta">
                      <span className="file-size">{formatSize(file.size)}</span>
                      <span className="file-date">{file.date}</span>
                    </div>
                  </div>
                  <span className={`file-type-badge badge-${file.type}`}>
                    {getTypeLabel(file.type)}
                  </span>
                  <div className="file-actions">
                    <button
                      className="action-icon-btn"
                      title="View"
                      onClick={() => handleView(file)}
                      disabled={!file.preview}
                    >
                      👁️
                    </button>
                    <button
                      className="action-icon-btn"
                      title="Scan for clones"
                      onClick={() => handleScan(file)}
                      disabled={!file.preview || file.type === 'zip'}
                    >
                      🔍
                    </button>
                    <button
                      className="action-icon-btn"
                      title="Download"
                      onClick={() => handleDownload(file)}
                    >
                      ⬇️
                    </button>
                    <button
                      className="action-icon-btn delete-btn"
                      title="Delete"
                      onClick={() => handleDelete(file.id)}
                    >
                      🗑️
                    </button>
                  </div>
                  {previewFile && previewFile.id === file.id && file.preview && (
                    <div className="file-preview">
                      <pre>{file.preview}</pre>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
        </>
        )}
      </div>

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

export default Files;
