import { HashRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Landing from './components/Landing';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import CodeAnalyzer from './components/CodeAnalyzer';
import Students from './components/Students';
import AnalysisResults from './components/AnalysisResults';
import StudentProfile from './components/StudentProfile';
import Refactoring from './components/Refactoring';
import History from './components/History';
import Files from './components/Files';
import Settings from './components/settings';
import Admin from './components/Admin';
import Features from './components/Features';
import HowItWorks from './components/HowItWorks';
import ChatDemo from './components/ChatDemo';
import './App.css';

const API = 'http://localhost:5000/api/v1';

function App() {
  useEffect(() => {
    // Apply light mode from saved settings
    if (localStorage.getItem('lightMode') === 'true') {
      document.body.classList.add('light-mode');
    }

    fetch(`${API}/auth/admin/theme`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.accentColor) {
          document.documentElement.style.setProperty('--accent-color', data.accentColor);
          localStorage.setItem('uiAccentColor', data.accentColor);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <HashRouter>
      <div className="app-wrapper">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/features" element={<Features />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/analyzer" element={<CodeAnalyzer />} />
          <Route path="/students" element={<Students />} />
          <Route path="/student-profile/:email" element={<StudentProfile />} />
          <Route path="/analysis-results" element={<AnalysisResults />} />
          <Route path="/refactoring" element={<Refactoring />} />
          <Route path="/history" element={<History />} />
          <Route path="/files" element={<Files />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/chat" element={<ChatDemo />} />
        </Routes>
      </div>
    </HashRouter>
  );
}

export default App;
