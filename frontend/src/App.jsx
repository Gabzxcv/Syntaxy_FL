import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import CodeAnalyzer from './components/CodeAnalyzer';
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
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
