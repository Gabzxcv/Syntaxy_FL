import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Students.css';

function Students() {
  const navigate = useNavigate();
  const [students] = useState([
    { id: 1, name: 'Alice Johnson', email: 'alice@example.com', submissions: 5 },
    { id: 2, name: 'Bob Smith', email: 'bob@example.com', submissions: 3 },
    { id: 3, name: 'Carol Williams', email: 'carol@example.com', submissions: 7 },
  ]);

  return (
    <div className="students-container">
      <div className="students-header">
        <h1>Students</h1>
        <p>Manage students and view their submissions</p>
      </div>

      <div className="students-nav">
        <button className="nav-btn" onClick={() => navigate('/dashboard')}>Dashboard</button>
        <button className="nav-btn" onClick={() => navigate('/analyzer')}>Analyzer</button>
      </div>

      <div className="students-table-wrapper">
        <table className="students-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Submissions</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id}>
                <td>{student.id}</td>
                <td>{student.name}</td>
                <td>{student.email}</td>
                <td>{student.submissions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Students;
