import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ─── Global 401 interceptor (installed once) ───
// Any API call returning 401 → hard logout. This catches every code path
// (component, hook, fetch-via-axios) without each having to handle it.
let _interceptorInstalled = false;
function installAuthInterceptor() {
  if (_interceptorInstalled) return;
  _interceptorInstalled = true;
  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error?.response?.status;
      const url = error?.config?.url || '';
      // Only react to 401s coming from our own API
      if (status === 401 && url.includes('/api/')) {
        const path = window.location.pathname;
        // Don't redirect on login/forgot pages where 401 is expected (bad creds, etc.)
        const onAuthPage = ['/login', '/forgot-password', '/reset-password'].some(p => path.startsWith(p));
        if (!onAuthPage) {
          localStorage.removeItem('bw_token');
          // Use replace so the broken URL isn't kept in browser history
          window.location.replace('/login');
        }
      }
      return Promise.reject(error);
    }
  );
}

// Lightweight JWT-shape check: a real JWT has exactly 3 base64url-safe segments.
// We do not verify the signature client-side; this is purely a defensive guard
// against tampered / garbage localStorage values surviving across reloads.
function isWellFormedJwt(t) {
  if (typeof t !== 'string') return false;
  const parts = t.split('.');
  if (parts.length !== 3) return false;
  // base64url alphabet check (loose)
  return parts.every(p => p.length > 0 && /^[A-Za-z0-9_-]+$/.test(p));
}

// ─── Module-level boot state ───
// Computed ONCE per page load (before React even mounts), so React.StrictMode's
// double-mount cannot wipe this signal. If localStorage had a malformed token
// at page boot, we remember that fact and force a real logout on first auth check.
const _BOOT_RAW_TOKEN = typeof window !== 'undefined' ? localStorage.getItem('bw_token') : null;
const _BOOT_TAMPERED = !!_BOOT_RAW_TOKEN && !isWellFormedJwt(_BOOT_RAW_TOKEN);
const _BOOT_VALID_TOKEN = _BOOT_TAMPERED ? null : _BOOT_RAW_TOKEN;
if (_BOOT_TAMPERED && typeof window !== 'undefined') {
  localStorage.removeItem('bw_token');
}

export function AuthProvider({ children }) {
  installAuthInterceptor();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(_BOOT_VALID_TOKEN);

  const getAuthHeaders = useCallback(() => {
    if (token) return { Authorization: `Bearer ${token}` };
    return {};
  }, [token]);

  const checkAuth = useCallback(async () => {
    // Skip auth check if returning from OAuth callback (Emergent or Google)
    if (window.location.hash?.includes('session_id=') ||
        window.location.pathname === '/auth/callback') {
      setLoading(false);
      return;
    }
    // If boot detected a tampered localStorage token, also clear the backend cookie
    // so the user can't be silently re-authenticated by it. Mark not-logged-in.
    if (_BOOT_TAMPERED) {
      try {
        await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
      } catch { /* noop */ }
      setUser(null);
      setToken(null);
      setLoading(false);
      return;
    }
    try {
      const resp = await axios.get(`${API}/auth/me`, {
        headers: getAuthHeaders(),
      });
      setUser(resp.data);
    } catch {
      setUser(null);
      localStorage.removeItem('bw_token');
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email, password) => {
    const resp = await axios.post(`${API}/auth/login`, { email, password }, { });
    const { token: t, user: u } = resp.data;
    localStorage.setItem('bw_token', t);
    setToken(t);
    setUser(u);
    return u;
  };

  const register = async (name, email, password) => {
    const resp = await axios.post(`${API}/auth/register`, { name, email, password }, { });
    const { token: t, user: u } = resp.data;
    localStorage.setItem('bw_token', t);
    setToken(t);
    setUser(u);
    return u;
  };

  const loginWithGoogle = async () => {
    try {
      // Use direct Google OAuth — works on both Emergent and Render
      const redirectUri = window.location.origin + '/auth/callback';
      const resp = await axios.get(`${API}/auth/google/url`, {
        params: { redirect_uri: redirectUri },
      });
      window.location.href = resp.data.url;
    } catch (err) {
      console.error('Failed to get Google OAuth URL, falling back to Emergent auth', err);
      // Fallback: Emergent OAuth (only works on Emergent platform)
      const redirectUrl = window.location.origin + '/dashboard';
      window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    }
  };

  const processGoogleCallback = async (code) => {
    const redirectUri = window.location.origin + '/auth/callback';
    const resp = await axios.post(`${API}/auth/google/callback`, {
      code,
      redirect_uri: redirectUri,
    }, { });
    const { token: t, user: u } = resp.data;
    localStorage.setItem('bw_token', t);
    setToken(t);
    setUser(u);
    return u;
  };

  const processSession = async (sessionId) => {
    const resp = await axios.post(`${API}/auth/session`, { session_id: sessionId }, { });
    const { token: t, user: u } = resp.data;
    localStorage.setItem('bw_token', t);
    setToken(t);
    setUser(u);
    return u;
  };

  const logout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, {
        headers: getAuthHeaders(),
      });
    } catch {
      // ignore logout-call failures — we always clear local state below
    }
    localStorage.removeItem('bw_token');
    setToken(null);
    setUser(null);
  };

  const value = {
    user, loading, token, login, register, logout,
    loginWithGoogle, processSession, processGoogleCallback,
    getAuthHeaders, setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
