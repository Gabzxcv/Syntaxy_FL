import { useNavigate } from 'react-router-dom';
import './Landing.css';

function About() {
  const navigate = useNavigate();

  return (
    <div className="landing-page">
      {/* ===== NAV ===== */}
      <nav className="landing-nav">
        <div className="landing-nav-brand" onClick={() => navigate('/')}>
          <img src="/logo.png" alt="Syntaxy" className="landing-nav-logo-img" />
          <span className="landing-nav-logo">Syntaxy</span>
        </div>
        <div className="landing-nav-links">
          <button className="nav-link" onClick={() => navigate('/')}>Home</button>
          <button className="nav-link active" onClick={() => navigate('/about')}>About</button>
        </div>
        <div className="landing-nav-actions">
          <button className="nav-sign-in" onClick={() => navigate('/login')}>
            Sign In
          </button>
        </div>
      </nav>

      {/* ===== ABOUT CONTENT ===== */}
      <section className="landing-hero" style={{ paddingTop: '120px' }}>
        <div className="hero-content" style={{ gridTemplateColumns: '1fr', textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
          <div className="hero-text">
            <h1 className="hero-title">About Syntaxy</h1>
            <p className="hero-subtitle" style={{ maxWidth: '100%' }}>
              {/* Edit this section to add your own about page content */}
              Syntaxy is a code analysis platform built to help instructors and students
              maintain code quality and originality. Our tools detect duplicated logic,
              provide refactoring suggestions, and track improvements over time.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-features" style={{ paddingTop: '40px' }}>
        <div className="features-inner">
          <div className="features-header">
            <span className="features-label">Our Mission</span>
            <h2 className="features-title">Empowering better code practices</h2>
            <p className="features-desc">
              {/* Edit this section to describe your mission */}
              We believe that writing clean, original code is a fundamental skill. Syntaxy
              provides the tools and insights needed to develop this skill effectively.
            </p>
          </div>

          <div className="features-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <h3 className="feature-title">Our Team</h3>
              <p className="feature-desc">
                {/* Edit this to describe your team */}
                A dedicated team of developers and educators working to make code analysis
                accessible and effective for everyone.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <h3 className="feature-title">Our Values</h3>
              <p className="feature-desc">
                {/* Edit this to describe your values */}
                Integrity, innovation, and education. We strive to build tools that make a
                real difference in how code is written and reviewed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="landing-footer">
        <div className="footer-inner">
          <div className="footer-brand-wrap">
            <img src="/logo.png" alt="Syntaxy" className="footer-logo-img" />
            <span className="footer-brand">Syntaxy</span>
          </div>
          <span className="footer-copy">&copy; {new Date().getFullYear()} Syntaxy by Fusion Logic. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}

export default About;
