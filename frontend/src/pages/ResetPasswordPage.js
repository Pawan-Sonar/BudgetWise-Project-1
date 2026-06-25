import React, { useState, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Lock, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function passwordStrength(pw) {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const levels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const colors = ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-500', 'bg-emerald-600'];
  return { score, label: levels[score], color: colors[score] };
}

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);
  const match = password && confirm && password === confirm;
  const mismatch = password && confirm && password !== confirm;

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-6">
        <div className="w-full max-w-md text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-8" data-testid="reset-invalid-token">
          <AlertCircle size={40} className="text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Invalid reset link</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">This password reset link is missing or malformed.</p>
          <Link to="/forgot-password">
            <Button className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg">Request a new link</Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API}/auth/reset-password`, { token, new_password: password });
      setDone(true);
      toast.success('Password updated successfully');
      setTimeout(() => navigate('/login'), 2200);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-6 py-12" data-testid="reset-password-page">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-8">
          {done ? (
            <div className="text-center" data-testid="reset-success-block">
              <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 size={28} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-2" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Password updated
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                You can now sign in with your new password. Redirecting…
              </p>
              <Link to="/login">
                <Button className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg" data-testid="reset-go-login-btn">
                  Go to Sign In
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center mb-5">
                <Lock size={22} className="text-indigo-500" />
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-2" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Choose a new password
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Pick a strong password you haven&apos;t used before.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="rp-pw" className="text-slate-700 dark:text-slate-300">New password</Label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-3 text-slate-400" />
                    <Input
                      id="rp-pw"
                      type={showPw ? 'text' : 'password'}
                      placeholder="Min 6 characters"
                      className="pl-10 pr-10 h-11 rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      data-testid="reset-password-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                      aria-label="Toggle password visibility"
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {password && (
                    <div className="mt-2">
                      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full ${strength.color} transition-all duration-300`} style={{ width: `${(strength.score / 5) * 100}%` }}></div>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5" data-testid="password-strength-label">
                        Strength: <span className="font-semibold">{strength.label}</span>
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rp-confirm" className="text-slate-700 dark:text-slate-300">Confirm password</Label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-3 text-slate-400" />
                    <Input
                      id="rp-confirm"
                      type={showPw ? 'text' : 'password'}
                      placeholder="Re-enter your new password"
                      className={`pl-10 h-11 rounded-lg dark:bg-slate-800 dark:text-white ${
                        mismatch ? 'border-red-400 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'
                      }`}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required
                      data-testid="reset-confirm-input"
                    />
                  </div>
                  {mismatch && <p className="text-xs text-red-500 mt-1">Passwords don&apos;t match</p>}
                  {match && <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1"><CheckCircle2 size={12} /> Passwords match</p>}
                </div>

                <Button
                  type="submit"
                  disabled={loading || password.length < 6 || password !== confirm}
                  className="w-full h-11 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-lg font-semibold"
                  data-testid="reset-submit-btn"
                >
                  {loading ? (<><Loader2 size={16} className="animate-spin mr-2" /> Updating…</>) : 'Update Password'}
                </Button>

                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  Remembered it? <Link to="/login" className="text-indigo-500 hover:text-indigo-600 font-semibold">Sign In</Link>
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
