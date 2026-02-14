// In production (GitHub Pages), use the deployed backend URL
// In development, use localhost
const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

export default API;