import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

const API = 'http://localhost:5000/api/v1';

function Dashboard() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (!token || !userStr) {
      navigate('/login');
      return;
    }

    fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Token expired');
      })
      .then((data) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
      });
  }, [navigate]);

  function handleLogout() {
    const token = localStorage.getItem('token');
    if (token) {
      fetch(`${API}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }

  if (!user) {
    return <div className="auth-container"><div className="dashboard"><p>Loading...</p></div></div>;
  }

  return (
    <div className="auth-container">
      <div className="auth-header">
        <h1>Code Clone Detector</h1>
        <p>Detect duplicate code &amp; improve quality</p>
      </div>

      <div className="dashboard">
        <div className="user-info">
          <h2>Welcome, {user.full_name || user.username}!</h2>
          <p>You are logged in</p>
        </div>
        <div className="user-detail"><strong>Username:</strong> {user.username}</div>
        <div className="user-detail"><strong>Email:</strong> {user.email}</div>
        <div className="user-detail">
          <strong>Member since:</strong>{' '}
          {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
        </div>
        <div className="user-detail">
          <strong>Total analyses:</strong> {user.total_analyses || 0}
        </div>
        <button className="btn" onClick={() => navigate('/analyzer')}>
          Go to Code Analyzer
        </button>
        <button className="btn btn-logout" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}

export default Dashboard;
