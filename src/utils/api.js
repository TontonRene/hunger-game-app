import axios from 'axios';

const api = axios.create({
  baseURL: 'https://hunger-game-backend.onrender.com',
});

export function setAuthToken(token) {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

export function updateBaseUrl(url) {
  api.defaults.baseURL = url;
}

export default api;
