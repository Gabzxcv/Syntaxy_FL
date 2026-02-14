import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Landing.css';

const steps = [
  {
    number: 1,
    title: 'Upload',
    description:
      'Drag and drop your source files or browse your file system. Syntaxy accepts individual files, ZIP archives, and entire project directories so you can get started in seconds.',
    icon: (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color, #6366f1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
  {
    number: 2,
    title: 'Select Language',
    description:
      'Choose the programming language of your submission. Syntaxy supports Python, Java, C, C++, JavaScript, and more, with language-specific parsing for accurate results.',
    icon: (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color, #6366f1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
        <line x1="14" y1="4" x2="10" y2="20" />
      </svg>
    ),
  },
  {
    number: 3,
    title: 'Analyse',
    description:
      'Hit the Analyse button and let the engine work. Syntaxy builds an abstract syntax tree, runs clone detection, computes metrics, and generates refactoring suggestions — all in one pass.',
    icon: (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color, #6366f1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 3.5" />
        <path d="M16.24 7.76l1.42-1.42" />
      </svg>
    ),
  },
  {
    number: 4,
    title: 'Review Results',
    description:
      'Explore an interactive report that highlights duplicated fragments, complexity hotspots, and quality scores. Filter by severity, file, or metric to focus on what matters most.',
    icon: (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color, #6366f1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    number: 5,
    title: 'Get Suggestions',
    description:
      'Receive actionable refactoring recommendations with before-and-after code previews. Each suggestion is ranked by impact so you can tackle the highest-value improvements first.',
    icon: (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color, #6366f1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18h6" />
        <path d="M10 22h4" />
        <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
      </svg>
    ),
  },
  {
    number: 6,
    title: 'Track History',
    description:
      'Every analysis is saved automatically. Compare results across revisions, track quality trends over time, and export reports for grading or team retrospectives.',
    icon: (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color, #6366f1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="M7 16l4-4 4 4 5-5" />
      </svg>
    ),
  },
];

function HowItWorks() {
  const navigate = useNavigate();

  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <div className="landing-nav-brand" onClick={() => navigate('/')}>
          <img src="/logo.png" alt="Syntaxy" className="landing-nav-logo-img" />
          <span className="landing-nav-logo">Syntaxy</span>
        </div>
        <div className="landing-nav-links">
          <button className="nav-link" onClick={() => navigate('/features')}>Features</button>
          <button className="nav-link" onClick={() => navigate('/how-it-works')}>How It Works</button>
        </div>
        <div className="landing-nav-actions">
          <button className="nav-sign-in" onClick={() => navigate('/login')}>Sign In</button>
        </div>
      </nav>

      <section className="landing-hero" style={{ paddingTop: '120px', minHeight: 'auto' }}>
        <h1 className="landing-hero-title">How It Works</h1>
        <p className="landing-hero-sub">
          From upload to insight in six simple steps.
        </p>
      </section>

      <section className="landing-features" style={{ paddingTop: '0' }}>
        <div className="features-grid">
          {steps.map((s) => (
            <div className="feature-card" key={s.number}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '8px',
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'var(--accent-color, #6366f1)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '1rem',
                    flexShrink: 0,
                  }}
                >
                  {s.number}
                </span>
                <div className="feature-icon" style={{ margin: 0 }}>{s.icon}</div>
              </div>
              <h3>{s.title}</h3>
              <p>{s.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-cta" style={{ padding: '60px 0 80px' }}>
        <h2 className="cta-title">Ready to get started?</h2>
        <p className="cta-sub">Create a free account and start analysing your code today.</p>
        <button className="cta-btn" onClick={() => navigate('/login')}>
          Get Started
        </button>
      </section>

      <footer className="landing-footer">
        <div className="footer-inner">
          <div className="footer-brand-wrap">
            <img src="/logo.png" alt="Syntaxy" className="footer-logo-img" />
            <span className="footer-brand">Syntaxy</span>
          </div>
          <span className="footer-copy">&copy; {new Date().getFullYear()} Syntaxy. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}

export default HowItWorks;
