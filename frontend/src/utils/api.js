export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

export async function api(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'TripEasy could not complete that request.');
  return payload;
}
