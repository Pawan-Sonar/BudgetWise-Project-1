import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Mail, ArrowLeft, CheckCircle2, Copy, ExternalLink, Loader2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [devLink, setDevLink] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const resp = await axios.post(`${API}/auth/forgot-password`, { email });
      setSubmitted(true);
      // Dev/portfolio mode: show reset link inline so demos work without a real inbox
      if (resp.data?.dev_reset_link) {
        setDevLink(resp.data.dev_reset_link);
      }
      toast.success('Reset link sent (check console in dev mode)');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(devLink);
    toast.success('Link copied');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-6 py-12" data-testid="forgot-password-page">
      <div className="w-full max-w-md">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mb-8" data-testid="back-to-login-link">
          <ArrowLeft size={16} /> Back to Sign In
        </Link>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-8">
          <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center mb-5">
            <Mail size={22} className="text-indigo-500" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-2" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Forgot your password?
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Enter the email associated with your account and we&apos;ll send you a secure link to reset your password.
          </p>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="fp-email" className="text-slate-700 dark:text-slate-300">Email</Label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-3 text-slate-400" />
                  <Input
                    id="fp-email"
                    type="email"
                    placeholder="you@example.com"
                    className="pl-10 h-11 rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    data-testid="forgot-email-input"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-semibold"
                data-testid="forgot-submit-btn"
              >
                {loading ? (<><Loader2 size={16} className="animate-spin mr-2" /> Sending...</>) : 'Send Reset Link'}
              </Button>
            </form>
          ) : (
            <div className="space-y-5" data-testid="forgot-success-block">
              <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-4 flex gap-3">
                <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-emerald-900 dark:text-emerald-300">Check your inbox</p>
                  <p className="text-emerald-700 dark:text-emerald-400 mt-1">
                    If an account exists for <strong>{email}</strong>, a password reset link has been sent. The link expires in 30 minutes.
                  </p>
                </div>
              </div>

              {devLink && (
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4">
                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-300 uppercase tracking-wide mb-2">
                    Demo / Dev mode — reset link
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
                    In production this would be emailed to you. For demo purposes, use the link below.
                  </p>
                  <div className="flex gap-2">
                    <a
                      href={devLink}
                      className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-500/40 rounded-lg text-xs font-mono text-amber-900 dark:text-amber-200 truncate hover:bg-amber-50 dark:hover:bg-amber-500/15 transition-colors flex items-center gap-2"
                      data-testid="dev-reset-link"
                    >
                      <ExternalLink size={12} className="flex-shrink-0" />
                      <span className="truncate">{devLink}</span>
                    </a>
                    <button
                      onClick={copyLink}
                      className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold"
                      data-testid="copy-link-btn"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              )}

              <Button
                onClick={() => { setSubmitted(false); setEmail(''); setDevLink(''); }}
                variant="outline"
                className="w-full h-11 rounded-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                data-testid="forgot-try-again-btn"
              >
                Try another email
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
