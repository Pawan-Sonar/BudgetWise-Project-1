import React, { useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from "../contexts/AuthContext";

export default function AuthCallback() {
  const hasProcessed = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { processSession, processGoogleCallback } = useAuth();

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    // Check for Emergent OAuth session_id in hash
    const hash = location.hash || window.location.hash;
    if (hash && hash.includes('session_id=')) {
      const params = new URLSearchParams(hash.replace('#', ''));
      const sessionId = params.get('session_id');
      if (sessionId) {
        processSession(sessionId)
          .then(() => navigate('/dashboard', { replace: true }))
          .catch(() => navigate('/login', { replace: true }));
        return;
      }
    }

    // Check for Google OAuth code in query params
    const searchParams = new URLSearchParams(location.search || window.location.search);
    const code = searchParams.get('code');
    if (code) {
      processGoogleCallback(code)
        .then(() => navigate('/dashboard', { replace: true }))
        .catch((err) => {
          console.error('Google OAuth callback failed:', err);
          navigate('/login', { replace: true });
        });
      return;
    }

    // No valid callback params
    navigate('/login', { replace: true });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-slate-600 dark:text-slate-400 font-medium">Signing you in...</p>
      </div>
    </div>
  );
}
