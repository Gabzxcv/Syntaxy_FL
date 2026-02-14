import { useNavigate } from 'react-router-dom';
import './Landing.css';

const TEAM_MEMBERS = [
  {
    name: 'Allen Gabriel Cruz',
    role: 'Main Programmer / Backend',
    image: '', // Add image URL here
  },
  {
    name: 'Joshua Nathaniel Castillo',
    role: 'Thesis Leader',
    image: '', // Add image URL here
  },
  {
    name: 'Erl Pascual',
    role: 'Main Researcher',
    image: '', // Add image URL here
  },
  {
    name: 'Giancarlo Andre Saba',
    role: 'Programmer / Frontend',
    image: '', // Add image URL here
  },
];

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

      {/* ===== HERO ===== */}
      <section className="landing-hero" style={{ minHeight: 'auto', paddingTop: '140px', paddingBottom: '60px' }}>
        <div className="hero-glow hero-glow--primary" />
        <div className="hero-content" style={{ gridTemplateColumns: '1fr', textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
          <div className="hero-text" style={{ maxWidth: '100%' }}>
            <div className="hero-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              About Us
            </div>
            <h1 className="hero-title">
              About <span className="hero-title-accent">Syntaxy</span>
            </h1>
            <p className="hero-subtitle" style={{ maxWidth: '100%', margin: '0 auto 40px' }}>
              Syntaxy is a code analysis platform built to help instructors and students
              maintain code quality and originality. Our tools detect duplicated logic,
              provide refactoring suggestions, and track improvements over time.
            </p>
          </div>
        </div>
      </section>

      {/* ===== OUR MISSION ===== */}
      <section className="landing-features" style={{ paddingTop: '40px', opacity: 1, transform: 'none' }}>
        <div className="features-inner">
          <div className="features-header">
            <span className="features-label">Our Mission</span>
            <h2 className="features-title">Empowering better code practices</h2>
            <p className="features-desc">
              We believe that writing clean, original code is a fundamental skill. Syntaxy
              provides the tools and insights needed to develop this skill effectively.
            </p>
          </div>

          <div className="features-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="feature-card" style={{ opacity: 1, transform: 'none' }}>
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <h3 className="feature-title">Our Team</h3>
              <p className="feature-desc">
                A dedicated team of developers and educators working to make code analysis
                accessible and effective for everyone.
              </p>
            </div>

            <div className="feature-card" style={{ opacity: 1, transform: 'none' }}>
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <h3 className="feature-title">Our Values</h3>
              <p className="feature-desc">
                Integrity, innovation, and education. We strive to build tools that make a
                real difference in how code is written and reviewed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== TEAM MEMBERS ===== */}
      <section className="landing-how-it-works" style={{ opacity: 1, transform: 'none' }}>
        <div className="how-inner">
          <div className="features-header">
            <span className="features-label">The Team</span>
            <h2 className="features-title">Meet the people behind Syntaxy</h2>
            <p className="features-desc">
              Our team brings together expertise in software engineering, research, and education.
            </p>
          </div>

          <div className="about-team-grid">
            {TEAM_MEMBERS.map((member) => (
              <div key={member.name} className="about-team-card">
                <div className="about-team-avatar">
                  {member.image ? (
                    <img src={member.image} alt={member.name} className="about-team-img" />
                  ) : (
                    <div className="about-team-placeholder">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="40" height="40">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                    </div>
                  )}
                </div>
                <h4 className="about-team-name">{member.name}</h4>
                <p className="about-team-role">{member.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== GALLERY / SHOWCASE SECTION ===== */}
      <section className="landing-features" style={{ opacity: 1, transform: 'none' }}>
        <div className="features-inner">
          <div className="features-header">
            <span className="features-label">Gallery</span>
            <h2 className="features-title">See Syntaxy in action</h2>
            <p className="features-desc">
              Screenshots and visuals of the platform in use.
            </p>
          </div>

          <div className="about-gallery">
            <div className="about-gallery-item">
              <div className="about-gallery-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="48" height="48">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                <p>Add your image here</p>
              </div>
              <h4 className="about-gallery-caption">Code Analysis Dashboard</h4>
            </div>
            <div className="about-gallery-item">
              <div className="about-gallery-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="48" height="48">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                <p>Add your image here</p>
              </div>
              <h4 className="about-gallery-caption">Clone Detection Results</h4>
            </div>
            <div className="about-gallery-item">
              <div className="about-gallery-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="48" height="48">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                <p>Add your image here</p>
              </div>
              <h4 className="about-gallery-caption">Student Management</h4>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CONTACT / INFO ===== */}
      <section className="landing-cta" style={{ opacity: 1, transform: 'none' }}>
        <div className="cta-inner">
          <div className="cta-glow" />
          <h2 className="cta-title">Get in touch</h2>
          <p className="cta-desc">
            Have questions or want to learn more? We{"'"}d love to hear from you.
          </p>
          <button className="hero-cta" onClick={() => navigate('/login')}>
            Try Syntaxy Now
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
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
