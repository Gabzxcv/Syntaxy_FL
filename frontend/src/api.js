const API = import.meta.env.VITE_API_URL || 
           (window.location.hostname === 'localhost' 
            ? 'http://localhost:5000/api/v1' 
            : 'https://syntaxy-fl-backend.onrender.com/api/v1');

export default API;