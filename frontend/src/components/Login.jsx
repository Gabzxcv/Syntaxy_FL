import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';

const API = 'http://localhost:5000/api/v1';

function Login() {
  const [activeTab, setActiveTab] = useState('login');
  const [message, setMessage] = useState({ text: '', type: '' });
  const [loginLoading, setLoginLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const navigate = useNavigate();

  function showMessage(text, type) {
    setMessage({ text, type });
  }

  function clearMessage() {
    setMessage({ text: '', type: '' });
  }

  async function handleLogin(e) {
    e.preventDefault();
    const username = e.target.elements['login-username'].value.trim();
    const password = e.target.elements['login-password'].value;

    setLoginLoading(true);
    clearMessage();

    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('user', JSON.stringify(data.user));
        navigate('/dashboard');
      } else {
        showMessage(data.error || 'Login failed', 'error');
      }
    } catch {
      showMessage('Connection error. Is the server running?', 'error');
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    const username = e.target.elements['reg-username'].value.trim();
    const email = e.target.elements['reg-email'].value.trim();
    const fullName = e.target.elements['reg-fullname'].value.trim();
    const role = e.target.elements['reg-role'].value;
    const password = e.target.elements['reg-password'].value;

    setRegisterLoading(true);
    clearMessage();

    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, full_name: fullName, role }),
      });
      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('user', JSON.stringify(data.user));
        navigate('/dashboard');
      } else {
        showMessage(data.error || 'Registration failed', 'error');
      }
    } catch {
      showMessage('Connection error. Is the server running?', 'error');
    } finally {
      setRegisterLoading(false);
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-header">
        <h1>Code Clone Detector</h1>
        <p>Detect duplicate code &amp; improve quality</p>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'login' ? 'active' : ''}`}
          onClick={() => { setActiveTab('login'); clearMessage(); }}
        >
          Login
        </button>
        <button
          className={`tab ${activeTab === 'register' ? 'active' : ''}`}
          onClick={() => { setActiveTab('register'); clearMessage(); }}
        >
          Register
        </button>
      </div>

      <div className="form-container">
        {message.text && (
          <div className={`message ${message.type}`}>{message.text}</div>
        )}

        {activeTab === 'login' && (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="login-username">Username</label>
              <input type="text" id="login-username" name="login-username" placeholder="Enter your username" required minLength="3" />
            </div>
            <div className="form-group">
              <label htmlFor="login-password">Password</label>
              <input type="password" id="login-password" name="login-password" placeholder="Enter your password" required />
            </div>
            <button type="submit" className="btn" disabled={loginLoading}>
              {loginLoading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        )}

        {activeTab === 'register' && (
          <form onSubmit={handleRegister}>
            <div className="form-group">
              <label htmlFor="reg-username">Username</label>
              <input type="text" id="reg-username" name="reg-username" placeholder="Choose a username" required minLength="3" />
            </div>
            <div className="form-group">
              <label htmlFor="reg-email">Email</label>
              <input type="email" id="reg-email" name="reg-email" placeholder="Enter your email" required />
            </div>
            <div className="form-group">
              <label htmlFor="reg-fullname">Full Name (optional)</label>
              <input type="text" id="reg-fullname" name="reg-fullname" placeholder="Enter your full name" />
            </div>
            <div className="form-group">
              <label htmlFor="reg-role">Account Type</label>
              <select id="reg-role" name="reg-role" className="form-select">
                <option value="instructor">Instructor</option>
                <option value="student">Student</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="reg-password">Password</label>
              <input type="password" id="reg-password" name="reg-password" placeholder="Create a password (min 6 chars)" required minLength="6" />
            </div>
            <button type="submit" className="btn" disabled={registerLoading}>
              {registerLoading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default Login;
