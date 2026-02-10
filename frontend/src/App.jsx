import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import CodeAnalyzer from './components/CodeAnalyzer';
import Students from './components/Students';
import Refactoring from './components/Refactoring';
import History from './components/History';
import Files from './components/Files';
import Settings from './components/settings';
import Admin from './components/Admin';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app-wrapper">
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/analyzer" element={<CodeAnalyzer />} />
          <Route path="/students" element={<Students />} />
          <Route path="/refactoring" element={<Refactoring />} />
          <Route path="/history" element={<History />} />
          <Route path="/files" element={<Files />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
