import React, { useState, useRef, useEffect } from 'react';
import './ChatDemo.css';

const AUTO_RESPONSES = {
  hello: 'Hi there! Welcome to Syntaxy. How can I help you today?',
  help: 'I can help you with clone detection, refactoring suggestions, batch analysis, history tracking, and more. Just ask!',
  'how to analyze':
    'To analyze code, upload your source files, select the programming language, and click Analyze. Syntaxy will generate a full report with metrics, clones, and refactoring suggestions.',
  'clone detection':
    'Clone Detection identifies duplicated code fragments across your codebase using abstract syntax tree comparison. It surfaces exact, near-miss, and semantic clones so you can consolidate logic.',
  refactoring:
    'Syntaxy provides context-aware refactoring suggestions such as extracting methods, simplifying conditionals, and removing dead code — all ranked by impact.',
};

function getResponse(input) {
  const lower = input.toLowerCase().trim();
  for (const [key, value] of Object.entries(AUTO_RESPONSES)) {
    if (lower.includes(key)) return value;
  }
  return 'Thanks for your question! You can explore our Features and How It Works pages for more details, or type "help" to see what I can assist with.';
}

function ChatDemo() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { from: 'bot', text: 'Hi! I am the Syntaxy Assistant. Ask me anything about the platform.' },
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const userMsg = { from: 'user', text: trimmed };
    const botMsg = { from: 'bot', text: getResponse(trimmed) };
    setMessages((prev) => [...prev, userMsg, botMsg]);
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') send();
  };

  return (
    <>
      {open && (
        <div className="chat-panel">
          <div className="chat-header">
            <span className="chat-header-title">Syntaxy Assistant</span>
            <button className="chat-close-btn" onClick={() => setOpen(false)} aria-label="Close chat">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f3f4f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg chat-msg-${m.from}`}>
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
