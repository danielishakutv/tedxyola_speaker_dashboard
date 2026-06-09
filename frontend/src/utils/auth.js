// Shared auth helpers — decode the JWT in localStorage for synchronous role checks.
// (Permissions for members are fetched fresh from /api/auth/me; role is safe to
// read from the token for UI gating since the backend enforces every action.)

export const decodeToken = () => {
  try {
    const token = localStorage.getItem('tedx_token');
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
};

export const getRole    = () => decodeToken()?.role || null;
export const getUsername = () => decodeToken()?.username || null;
export const isAdmin    = () => getRole() === 'admin';
export const isStaff    = () => ['admin', 'editor'].includes(getRole());
export const isMember   = () => getRole() === 'member';
