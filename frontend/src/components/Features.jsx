import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Landing.css';

const featuresList = [
  {
    title: 'Clone Detection',
    description:
      'Identify duplicated code fragments across your entire codebase with our advanced clone-detection engine. Syntaxy analyzes abstract syntax trees to surface exact, near-miss, and semantic clones so you can consolidate logic, reduce maintenance burden, and enforce DRY principles at scale.',
    icon: (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color, #6366f1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="13" width="8" height="8" rx="1.5" />
        <path d="M13 7h2a2 2 0 0 1 2 2v2" />
        <path d="M7 13v2a2 2 0 0 0 2 2h2" />
      </svg>
    ),
  },
  {
    title: 'Refactoring',
    description:
      'Receive context-aware refactoring suggestions powered by static analysis. From extracting methods to simplifying conditionals, Syntaxy recommends actionable improvements that boost readability and performance while preserving correctness.',
    icon: (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color, #6366f1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v6m0 0l3-3m-3 3L9 6" />
        <path d="M12 21v-6m0 0l3 3m-3-3l-3 3" />
        <path d="M3 12h6m0 0L6 9m3 3L6 15" />
        <path d="M21 12h-6m0 0l3-3m-3 3l3 3" />
      </svg>
    ),
  },
  {
    title: 'Batch Analysis',
    description:
      'Upload entire project directories or multiple student submissions at once. Syntaxy processes files in parallel, generating consolidated reports that let you compare results side-by-side and spot patterns across submissions instantly.',
    icon: (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color, #6366f1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 10h16" />
        <path d="M10 4v16" />
      </svg>
    ),
  },
  {
    title: 'History Tracking',
    description:
      'Every analysis is stored with a timestamp and full snapshot so you can revisit past results, compare changes over time, and track how code quality evolves across semesters or sprints.',
    icon: (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color, #6366f1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </svg>
    ),
  },
  {
    title: 'Student Management',
    description:
      'Organize learners into groups, assign submissions, and monitor individual progress from a single dashboard. Role-based access ensures instructors see aggregate insights while students see only their own feedback.',
    icon: (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color, #6366f1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="7" r="3" />
        <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        <path d="M21 21v-2a4 4 0 0 0-3-3.87" />
      </svg>
    ),
  },
  {
    title: 'Code Metrics',
    description:
      'Get quantitative insights including cyclomatic complexity, lines of code, maintainability index, and more. Visual dashboards make it easy to identify hotspots and prioritize technical-debt reduction.',
    icon: (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color, #6366f1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="M7 16l4-4 4 4 5-5" />
      </svg>
    ),
  },
];

function Features() {
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
        <h1 className="landing-hero-title">Features</h1>
        <p className="landing-hero-sub">
          Everything you need to analyze, improve, and manage code in one place.
        </p>
      </section>

      <section className="landing-features" style={{ paddingTop: '0' }}>
        <div className="features-grid">
          {featuresList.map((f) => (
            <div className="feature-card" key={f.title}>
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-cta" style={{ padding: '60px 0 80px' }}>
        <h2 className="cta-title">Ready to get started?</h2>
        <p className="cta-sub">Create a free account and start analyzing your code today.</p>
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

export default Features;
