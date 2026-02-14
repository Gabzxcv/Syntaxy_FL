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
    case 'zip': return 'ZIP';
    case 'java': return 'JV';
    case 'python': return 'PY';
    case 'text': return 'TXT';
    default: return 'F';
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
  const [viewerFile, setViewerFile] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedSection, setSelectedSection] = useState('');
  const [filterSection, setFilterSection] = useState('all');
  const [sections] = useState(() => {
    const savedSections = localStorage.getItem('savedSections');
    return savedSections ? JSON.parse(savedSections) : [];
  });
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : { username: 'User', email: 'user@email.com', full_name: 'User' };
  const profilePic = user ? localStorage.getItem('profilePicture_' + user.id) : null;
  const isStudent = user.role === 'student';

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
    if (localStorage.getItem('lightMode') === 'true') {
      document.body.classList.add('light-mode');
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
    const matchesSection = filterSection === 'all' || (f.section && f.section === filterSection);
    return matchesSearch && matchesType && matchesSection;
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
              section: selectedSection || '',
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
                  section: selectedSection || '',
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
            section: selectedSection || '',
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
                section: selectedSection || '',
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
    if (file.fullContent || file.preview) {
      setViewerFile(file);
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
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></span> Dashboard
          </button>
          <button className="nav-item" onClick={() => navigate('/analyzer')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></span> Compiler Area
          </button>
          <button className="nav-item active">
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span> Files
          </button>
          <button className="nav-item" onClick={() => navigate('/analysis-results')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span> Analysis Results
          </button>
          <button className="nav-item" onClick={() => navigate('/students')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
            Students
          </button>
          <button className="nav-item" onClick={() => navigate('/refactoring')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg></span> Refactoring
          </button>
          <button className="nav-item" onClick={() => navigate('/history')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span> History
          </button>
          <button className="nav-item" onClick={() => navigate('/settings')}>
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span> Settings
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

      <div className="main-content">
        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner">Loading files...</div>
          </div>
        ) : (
          <>
            <div className="files-header">
              <div className="header-left">
                <h2 className="page-title">{isStudent ? 'My Files' : 'File Manager'}</h2>
                <p className="page-subtitle">{isStudent ? 'View and manage your uploaded submissions' : 'Upload, organize, and scan your code files'}</p>
              </div>
            </div>

        <div className="files-content">
          {/* Stats Cards */}
          <div className="files-stats">
            <div className="stat-card">
              <div className="stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg></div>
              <div className="stat-info">
                <div className="stat-value">{files.length}</div>
                <div className="stat-label">Total Files</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div>
              <div className="stat-info">
                <div className="stat-value">{formatSize(totalSize)}</div>
                <div className="stat-label">Total Size</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></div>
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
            <div className="drop-zone-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>
            <div className="drop-zone-text">
              Drag & drop files here, or click to browse
            </div>
            <div className="drop-zone-hint">Supports .zip, .txt, .java, .py files</div>
            {sections.length > 0 && (
              <div className="section-upload-selector">
                <select
                  className="filter-select"
                  value={selectedSection}
                  onChange={(e) => setSelectedSection(e.target.value)}
                  style={{ marginBottom: '12px', minWidth: '200px' }}
                >
                  <option value="">All Sections (No Section)</option>
                  {sections.map((s) => (
                    <option key={s.id || s.name} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
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
              <span className="search-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
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
            {sections.length > 0 && (
              <select
                className="filter-select"
                value={filterSection}
                onChange={(e) => setFilterSection(e.target.value)}
              >
                <option value="all">All Sections</option>
                {sections.map((s) => (
                  <option key={s.id || s.name} value={s.name}>{s.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* File List */}
          <div className="files-list">
            {filteredFiles.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>
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
                  {file.section && (
                    <span className="file-section-badge">{file.section}</span>
                  )}
                  <div className="file-actions">
                    <button
                      className="action-icon-btn"
                      title="View"
                      onClick={() => handleView(file)}
                      disabled={!file.preview}
                    >
                      View
                    </button>
                    <button
                      className="action-icon-btn"
                      title="Scan for clones"
                      onClick={() => handleScan(file)}
                      disabled={!file.preview || file.type === 'zip'}
                    >
                      Scan
                    </button>
                    <button
                      className="action-icon-btn"
                      title="Download"
                      onClick={() => handleDownload(file)}
                    >
                      Download
                    </button>
                    <button
                      className="action-icon-btn delete-btn"
                      title="Delete"
                      onClick={() => handleDelete(file.id)}
                    >
                      Delete
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

      {viewerFile && (
        <div className="help-modal-overlay" onClick={() => setViewerFile(null)}>
          <div className="help-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '80vh' }}>
            <div className="help-modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                {viewerFile.name}
              </h3>
              <button className="help-close-btn" onClick={() => setViewerFile(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="help-modal-body" style={{ padding: 0 }}>
              <div style={{ display: 'flex', gap: '16px', padding: '12px 20px', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <span>Type: {getTypeLabel(viewerFile.type)}</span>
                <span>Size: {formatSize(viewerFile.size)}</span>
                <span>Uploaded: {viewerFile.date}</span>
                {viewerFile.section && <span>Section: {viewerFile.section}</span>}
              </div>
              <pre style={{ margin: 0, padding: '16px 20px', overflow: 'auto', maxHeight: '60vh', fontSize: '0.85rem', fontFamily: "'Fira Code', 'Consolas', monospace", lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-primary)', background: 'var(--bg-primary)' }}>
                {viewerFile.fullContent || viewerFile.preview || 'No content available'}
              </pre>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '12px 20px', borderTop: '1px solid var(--border-color)' }}>
              <button className="action-btn secondary" onClick={() => handleScan(viewerFile)} disabled={!viewerFile.preview || viewerFile.type === 'zip'} style={{ fontSize: '0.85rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', verticalAlign: 'middle' }}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                Analyze in Compiler
              </button>
              <button className="action-btn secondary" onClick={() => handleDownload(viewerFile)} style={{ fontSize: '0.85rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', verticalAlign: 'middle' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download
              </button>
              <button className="action-btn primary" onClick={() => setViewerFile(null)} style={{ fontSize: '0.85rem' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Files;
