import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from './Logo';
import './ChatDemo.css';

const MAX_PREVIEW_LENGTH = 36;
const AUTO_REPLY_DELAY_MS = 1200;
const AUTO_REPLIES = ['gege', 'oks', 'omsim'];

function getStorageKey(userId, contactId) {
  return `chat_${userId}_${contactId}`;
}

function loadMessages(userId, contactId) {
  try {
    const raw = localStorage.getItem(getStorageKey(userId, contactId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMessages(userId, contactId, messages) {
  localStorage.setItem(getStorageKey(userId, contactId), JSON.stringify(messages));
}

function getCurrentUser() {
  try {
    const raw = localStorage.getItem('user');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.username || parsed.name || parsed.email || 'me';
    }
  } catch {
    // fall through
  }
  return 'me';
}

function getLastPreview(userId, contactId) {
  const msgs = loadMessages(userId, contactId);
  if (msgs.length === 0) return 'No messages yet';
  const lastText = msgs[msgs.length - 1].text;
  return lastText.length > MAX_PREVIEW_LENGTH
    ? lastText.slice(0, MAX_PREVIEW_LENGTH) + '...'
    : lastText;
}

function getContactsForSection(section) {
  const sectionContacts = [];
  if (section.instructor) {
    sectionContacts.push({ id: `instructor-${section.id}-${section.instructor}`, name: section.instructor, role: 'instructor' });
  }
  (section.students || []).forEach((s) => {
    const name = typeof s === 'string' ? s : s.name || s.username;
    if (name) {
      sectionContacts.push({ id: `student-${section.id}-${name}`, name, role: 'student' });
    }
  });
  return sectionContacts;
}

function ChatDemo() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;

  const [activeContact, setActiveContact] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sections, setSections] = useState([]);
  const [showHelp, setShowHelp] = useState(false);
  const messagesEndRef = useRef(null);
  const replyTimerRef = useRef(null);

  const userId = getCurrentUser();

  const profilePicture = localStorage.getItem('profilePicture_' + (user && user.id));

  useEffect(() => {
    if (!token || !user) {
      navigate('/login');
    }
  }, [token, user, navigate]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('savedSections');
      setSections(raw ? JSON.parse(raw) : []);
    } catch { setSections([]); }
  }, []);

  const openConversation = useCallback((contact) => {
    setActiveContact(contact);
    setMessages(loadMessages(userId, contact.id));
  }, [userId]);

  const goBackToSections = useCallback(() => {
    setSelectedSection(null);
    setActiveContact(null);
    setMessages([]);
    setInput('');
  }, []);

  const goBackToContacts = useCallback(() => {
    setActiveContact(null);
    setMessages([]);
    setInput('');
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
    };
  }, []);

  const send = () => {
    const trimmed = input.trim();
    if (!trimmed || !activeContact) return;

    const userMsg = { from: 'user', text: trimmed, ts: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next);
    saveMessages(userId, activeContact.id, next);
    setInput('');

    if (replyTimerRef.current) clearTimeout(replyTimerRef.current);
    const contactRef = activeContact;
    replyTimerRef.current = setTimeout(() => {
      const reply = AUTO_REPLIES[Math.floor(Math.random() * AUTO_REPLIES.length)];
      const replyMsg = { from: 'contact', text: reply, ts: Date.now() };
      setMessages((prev) => {
        const updated = [...prev, replyMsg];
        saveMessages(userId, contactRef.id, updated);
        return updated;
      });
    }, AUTO_REPLY_DELAY_MS);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') send();
  };

  function handleLogout() {
    const tk = localStorage.getItem('token');
    if (tk) {
      fetch(`${API}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tk}` },
      }).catch(() => {});
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }

  if (!token || !user) return null;

  return (
    <div className="chatpage-layout">
      {/* Sidebar */}
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
            Analysis Results
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
          <button className="nav-item active">
            <span className="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
            Chat
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
      <main className="chatpage-main">
        <header className="chatpage-header">
          <div className="header-left">
            <h2 className="page-title">Chat</h2>
            <p className="page-subtitle">Message your instructors and classmates</p>
          </div>
        </header>

        <div className="chatpage-body">
          {/* Left Panel — Sections / Contacts */}
          <div className="chatpage-contacts-panel">
            <div className="chatpage-contacts-header">
              {selectedSection ? (
                <>
                  <button className="chatpage-back-btn" onClick={goBackToSections} aria-label="Back to sections">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <span className="chatpage-contacts-title">{selectedSection.name}</span>
                </>
              ) : (
                <span className="chatpage-contacts-title">Sections</span>
              )}
            </div>

            <div className="chatpage-contacts-list">
              {!selectedSection ? (
                sections.length === 0 ? (
                  <div className="chatpage-empty">No sections available. Ask your instructor or admin to create sections first.</div>
                ) : (
                  sections.map((sec) => (
                    <button
                      key={sec.id}
                      className="chatpage-contact-item"
                      onClick={() => setSelectedSection(sec)}
                      aria-label={`Open section ${sec.name}`}
                    >
                      <span className="chatpage-contact-avatar chatpage-section-avatar">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                      </span>
                      <span className="chatpage-contact-info">
                        <span className="chatpage-contact-name">{sec.name}</span>
                        <span className="chatpage-contact-preview">
                          {sec.instructor ? `Instructor: ${sec.instructor}` : ''} &middot; {(sec.students || []).length} student{(sec.students || []).length !== 1 ? 's' : ''}
                        </span>
                      </span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="chatpage-chevron"><polyline points="9 18 15 12 9 6" /></svg>
                    </button>
                  ))
                )
              ) : (
                getContactsForSection(selectedSection).length === 0 ? (
                  <div className="chatpage-empty">No people in this section yet.</div>
                ) : (
                  getContactsForSection(selectedSection).map((c) => (
                    <button
                      key={c.id}
                      className={`chatpage-contact-item${activeContact && activeContact.id === c.id ? ' chatpage-contact-active' : ''}`}
                      onClick={() => openConversation(c)}
                      aria-label={`Chat with ${c.name}`}
                    >
                      <span className={`chatpage-contact-avatar${c.role === 'instructor' ? ' chatpage-avatar-instructor' : ''}`}>
                        {c.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="chatpage-contact-info">
                        <span className="chatpage-contact-name">
                          {c.name}
                          <span className="chatpage-contact-role">{c.role}</span>
                        </span>
                        <span className="chatpage-contact-preview">{getLastPreview(userId, c.id)}</span>
                      </span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="chatpage-chevron"><polyline points="9 18 15 12 9 6" /></svg>
                    </button>
                  ))
                )
              )}
            </div>
          </div>

          {/* Right Panel — Conversation */}
          <div className="chatpage-conversation-panel">
            {activeContact ? (
              <>
                <div className="chatpage-convo-header">
                  <button className="chatpage-back-btn chatpage-back-mobile" onClick={goBackToContacts} aria-label="Back to contacts">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <span className={`chatpage-contact-avatar chatpage-convo-avatar${activeContact.role === 'instructor' ? ' chatpage-avatar-instructor' : ''}`}>
                    {activeContact.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="chatpage-convo-name">{activeContact.name}</span>
                  <span className="chatpage-convo-role">{activeContact.role}</span>
                </div>
                <div className="chatpage-messages">
                  {messages.length === 0 && (
                    <div className="chatpage-empty">No messages yet. Say hello!</div>
                  )}
                  {messages.map((m, i) => (
                    <div key={i} className={`chatpage-msg chatpage-msg-${m.from === 'user' ? 'user' : 'contact'}`}>
                      {m.text}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                <div className="chatpage-input-area">
                  <input
                    className="chatpage-input"
                    type="text"
                    placeholder="Type a message..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <button className="chatpage-send-btn" onClick={send} aria-label="Send message">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f3f4f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </>
            ) : (
              <div className="chatpage-no-convo">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <p>Select a contact to start a conversation</p>
              </div>
            )}
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
                <h4>Chat</h4>
                <p>Browse sections, select a contact, and send messages. Conversations are saved locally in your browser.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatDemo;
