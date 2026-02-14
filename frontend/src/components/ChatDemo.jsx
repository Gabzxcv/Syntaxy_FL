import React, { useState, useRef, useEffect, useCallback } from 'react';
import './ChatDemo.css';

const FALLBACK_CONTACTS = [
  { id: 'instructor-1', name: 'Dr. Smith', role: 'instructor' },
  { id: 'student-1', name: 'Alice Chen', role: 'student' },
  { id: 'student-2', name: 'Bob Martinez', role: 'student' },
  { id: 'student-3', name: 'Carlos Wang', role: 'student' },
];

const MAX_PREVIEW_LENGTH = 36;
const AUTO_REPLY_DELAY_MS = 1200;

const AUTO_REPLIES = [
  'Got it, thanks!',
  "I'll check the analysis results.",
  'Have you submitted the assignment?',
  'Sounds good, let me know if you need anything.',
  'Thanks for the update!',
];

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

function buildContacts() {
  try {
    const raw = localStorage.getItem('savedSections');
    if (raw) {
      const sections = JSON.parse(raw);
      const contacts = [];
      const seen = new Set();
      if (Array.isArray(sections)) {
        sections.forEach((section) => {
          if (section.instructor && !seen.has(section.instructor)) {
            seen.add(section.instructor);
            contacts.push({
              id: `instructor-${seen.size}`,
              name: section.instructor,
              role: 'instructor',
            });
          }
          const students = section.students || section.enrolledStudents || [];
          students.forEach((s) => {
            const name = typeof s === 'string' ? s : s.name || s.username;
            if (name && !seen.has(name)) {
              seen.add(name);
              contacts.push({
                id: `student-${seen.size}`,
                name,
                role: 'student',
              });
            }
          });
        });
      }
      if (contacts.length > 0) return contacts;
    }
  } catch {
    // fall through to defaults
  }
  return FALLBACK_CONTACTS;
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

function ChatDemo() {
  const [open, setOpen] = useState(false);
  const [activeContact, setActiveContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const replyTimerRef = useRef(null);

  const userId = getCurrentUser();

  const handleClose = useCallback(() => {
    setOpen(false);
    setActiveContact(null);
    setMessages([]);
    setInput('');
  }, []);
  const [contacts] = useState(() => buildContacts());

  const openConversation = useCallback((contact) => {
    setActiveContact(contact);
    setMessages(loadMessages(userId, contact.id));
  }, [userId]);

  const goBack = useCallback(() => {
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

  return (
    <>
      {open && (
        <div className="chat-panel">
          <div className="chat-header">
            {activeContact ? (
              <>
                <button
                  className="chat-close-btn"
                  onClick={goBack}
                  aria-label="Back to contacts"
                  style={{ marginRight: 8 }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f3f4f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <span className="chat-header-title">{activeContact.name}</span>
              </>
            ) : (
              <span className="chat-header-title">Messages</span>
            )}
            <button className="chat-close-btn" onClick={handleClose} aria-label="Close chat">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f3f4f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {!activeContact ? (
            <div className="chat-messages" style={{ padding: 0 }}>
              {contacts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openConversation(c)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    padding: '12px 16px',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  aria-label={`Chat with ${c.name}`}
                >
                  <span
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: c.role === 'instructor' ? '#6366f1' : '#374151',
                      color: '#f3f4f6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      flexShrink: 0,
                    }}
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#f3f4f6', fontWeight: 600, fontSize: '0.88rem' }}>{c.name}</span>
                      <span style={{ color: '#9ca3af', fontSize: '0.72rem', textTransform: 'capitalize' }}>{c.role}</span>
                    </span>
                    <span style={{ color: '#6b7280', fontSize: '0.78rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {getLastPreview(userId, c.id)}
                    </span>
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="chat-messages">
                {messages.length === 0 && (
                  <div style={{ color: '#6b7280', textAlign: 'center', marginTop: 32, fontSize: '0.85rem' }}>
                    No messages yet. Say hello!
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`chat-msg chat-msg-${m.from === 'user' ? 'user' : 'bot'}`}>
                    {m.text}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <div className="chat-input-area">
                <input
                  className="chat-input"
                  type="text"
                  placeholder="Type a message..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <button className="chat-send-btn" onClick={send} aria-label="Send message">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f3f4f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <button className="chat-fab" onClick={() => setOpen((o) => !o)} aria-label="Open chat">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f3f4f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    </>
  );
}

export default ChatDemo;
