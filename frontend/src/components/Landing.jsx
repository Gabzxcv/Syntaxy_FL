import { useNavigate } from 'react-router-dom';
import './Landing.css';

function Landing() {
  const navigate = useNavigate();

  return (
    <div className="landing-page">
      {/* ===== NAV ===== */}
      <nav className="landing-nav">
        <div className="landing-nav-logo">Syntaxy</div>
        <div className="landing-nav-actions">
          <button className="nav-sign-in" onClick={() => navigate('/login')}>
            Sign In
          </button>
        </div>
      </nav>

      {/* ===== HERO ===== */}
      <section className="landing-hero">
        <div className="hero-glow hero-glow--primary" />
        <div className="hero-glow hero-glow--secondary" />

        <div className="hero-content">
          <div className="hero-text">
            <div className="hero-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              Code Analysis Platform
            </div>

            <h1 className="hero-title">
              Detect clones.<br />
              <span className="hero-title-accent">Refactor smarter.</span>
            </h1>

            <p className="hero-subtitle">
              Syntaxy scans your codebase for duplicated logic, surfaces refactoring
              opportunities, and tracks changes over time — so your code stays clean
              and your team ships faster.
            </p>

            <div className="hero-actions">
              <button className="hero-cta" onClick={() => navigate('/login')}>
                Get Started
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </button>
              <button className="hero-cta-secondary" onClick={() => {
                document.querySelector('.landing-features')?.scrollIntoView({ behavior: 'smooth' });
              }}>
                See Features
              </button>
            </div>
          </div>

          {/* Code window mockup */}
          <div className="hero-visual">
            <div className="code-window">
              <div className="code-window-bar">
                <span className="window-dot window-dot--red" />
                <span className="window-dot window-dot--yellow" />
                <span className="window-dot window-dot--green" />
                <span className="code-window-tab">analysis.py</span>
              </div>
              <div className="code-window-body">
                <div className="code-line">
                  <span className="code-line-num">1</span>
                  <span className="code-line-text">
                    <span className="code-keyword">def </span>
                    <span className="code-fn">detect_clones</span>
                    <span className="code-line-text">(source, threshold):</span>
                  </span>
                </div>
                <div className="code-line">
                  <span className="code-line-num">2</span>
                  <span className="code-line-text">
                    {'    '}<span className="code-var">ast</span> <span className="code-op">=</span> parse(source)
                  </span>
                </div>
                <div className="code-line">
                  <span className="code-line-num">3</span>
                  <span className="code-line-text">
                    {'    '}<span className="code-keyword">for </span>
                    <span className="code-var">node</span>
                    <span className="code-keyword"> in </span>
                    walk(ast):
                  </span>
                </div>
                <div className="code-line">
                  <span className="code-line-num">4</span>
                  <span className="code-line-text">
                    {'        '}<span className="code-var">sim</span> <span className="code-op">=</span> similarity(node)
                  </span>
                </div>
                <div className="code-line">
                  <span className="code-line-num">5</span>
                  <span className="code-line-text">
                    {'        '}<span className="code-keyword">if </span>
                    <span className="code-var">sim</span> <span className="code-op">&gt;=</span> threshold:
                  </span>
                </div>
                <div className="code-line">
                  <span className="code-line-num">6</span>
                  <span className="code-line-text">
                    {'            '}<span className="code-keyword">yield </span>
                    <span className="code-fn">Clone</span>(node, sim)
                  </span>
                </div>
                <div className="code-line">
                  <span className="code-line-num">7</span>
                  <span className="code-line-text">
                    {'    '}<span className="code-comment"># 3 clones found — 87% avg similarity</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="code-highlight-overlay">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span className="code-highlight-text">3 clones detected</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="landing-features">
        <div className="features-inner">
          <div className="features-header">
            <span className="features-label">Features</span>
            <h2 className="features-title">Everything you need to keep code clean</h2>
            <p className="features-desc">
              From detection to refactoring — Syntaxy gives instructors and students
              the tools to write better, more original code.
            </p>
          </div>

          <div className="features-grid">
            {/* Clone Detection */}
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </div>
              <h3 className="feature-title">Code Clone Detection</h3>
              <p className="feature-desc">
                Identify duplicated logic across files using AST-level analysis.
                Catches Type-I through Type-III clones that simple text diffs miss.
              </p>
            </div>

            {/* Refactoring */}
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </div>
              <h3 className="feature-title">Refactoring Suggestions</h3>
              <p className="feature-desc">
                Get actionable recommendations to eliminate duplication — extract
                shared functions, consolidate logic, and improve structure.
              </p>
            </div>

            {/* Batch Analysis */}
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <h3 className="feature-title">Batch Analysis</h3>
              <p className="feature-desc">
                Upload entire directories or ZIP archives and analyze dozens of
                files at once. Perfect for reviewing student submissions in bulk.
              </p>
            </div>

            {/* History */}
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h3 className="feature-title">History Tracking</h3>
              <p className="feature-desc">
                Every analysis is saved with full context. Compare results over
                time to measure improvement and catch regressions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== STATS ===== */}
      <section className="landing-stats">
        <div className="stats-inner">
          <div className="stat-item">
            <div className="stat-number">AST<span>.</span></div>
            <div className="stat-caption">Syntax-level analysis</div>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <div className="stat-number">Type I–III</div>
            <div className="stat-caption">Clone types detected</div>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <div className="stat-number">Batch</div>
            <div className="stat-caption">Multi-file processing</div>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <div className="stat-number">&infin;</div>
            <div className="stat-caption">Analysis history</div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="landing-footer">
        <div className="footer-inner">
          <span className="footer-brand">Syntaxy</span>
          <span className="footer-copy">&copy; {new Date().getFullYear()} Syntaxy. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
