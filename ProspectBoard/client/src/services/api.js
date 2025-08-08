import axios from 'axios';

// Create axios instance with base configuration
export const api = axios.create({
  baseURL: '/api',
  timeout: 30000, // 30 seconds timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token if it exists
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - clear token and redirect to login
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API endpoints
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (email, password) => api.post('/auth/register', { email, password }),
  verify: () => api.get('/auth/verify'),
};

export const prospectsAPI = {
  getProspects: (params = {}) => api.get('/prospects', { params }),
  getProspect: (id) => api.get(`/prospects/${id}`),
  updateProspect: (id, data) => api.put(`/prospects/${id}`, data),
  deleteProspect: (id) => api.delete(`/prospects/${id}`),
  addToPlaylist: (prospectId, playlistId) => api.post(`/prospects/${prospectId}/playlists/${playlistId}`),
  removeFromPlaylist: (prospectId, playlistId) => api.delete(`/prospects/${prospectId}/playlists/${playlistId}`),
  getStats: () => api.get('/prospects/stats/overview'),
};

export const playlistsAPI = {
  getPlaylists: () => api.get('/playlists'),
  getPlaylist: (id) => api.get(`/playlists/${id}`),
  createPlaylist: (data) => api.post('/playlists', data),
  updatePlaylist: (id, data) => api.put(`/playlists/${id}`, data),
  deletePlaylist: (id) => api.delete(`/playlists/${id}`),
  addProspects: (playlistId, prospectIds) => api.post(`/playlists/${playlistId}/prospects`, { prospectIds }),
  removeProspect: (playlistId, prospectId) => api.delete(`/playlists/${playlistId}/prospects/${prospectId}`),
  getHiddenPlaylist: () => api.get('/playlists/special/hidden'),
  moveToHidden: (prospectId) => api.post(`/playlists/special/hidden/prospects/${prospectId}`),
};

export const scrapingAPI = {
  getSessions: () => api.get('/scraping/sessions'),
  getSession: (id) => api.get(`/scraping/sessions/${id}`),
  startScraping: (data) => api.post('/scraping/start', data),
};

export const emailAPI = {
  testConfig: (testEmail) => api.post('/email/test', { testEmail }),
  getCampaigns: () => api.get('/email/campaigns'),
  getCampaign: (id) => api.get(`/email/campaigns/${id}`),
  sendCampaign: (data) => api.post('/email/campaigns/send', data),
  previewTemplate: (data) => api.post('/email/preview', data),
  getTemplates: () => api.get('/email/templates'),
  getTemplate: (id) => api.get(`/email/templates/${id}`),
  validateTemplate: (template) => api.post('/email/templates/validate', { template }),
};
