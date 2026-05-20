const API = 'http://localhost:5000';

/**
 * Wrapper around fetch that automatically:
 * - Prepends the API base URL
 * - Attaches the JWT Bearer token from localStorage
 * - Redirects to /login on 401
 */
export const authFetch = async (path, options = {}) => {
  const token = localStorage.getItem('tedx_token');

  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Don't set Content-Type for FormData — browser sets it with boundary
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('tedx_token');
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  return res;
};
