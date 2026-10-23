import React, { useState } from 'react';
import { X, Mail, Lock, Sparkles, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: User) => void;
  onToast: (msg: string) => void;
}

export function AuthModal({ isOpen, onClose, onSuccess, onToast }: AuthModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }
    if (!email.trim() || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });

        if (signUpError) throw signUpError;

        if (data.user) {
          if (data.session) {
            onToast('Account created and verified!');
            onSuccess(data.user);
            onClose();
          } else {
            onToast('Confirmation link sent! Check your Gmail to complete verification.');
            onClose();
          }
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInError) throw signInError;

        if (data.user) {
          onToast('Welcome back to WAYPOINT AI');
          onSuccess(data.user);
          onClose();
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleOAuth = async () => {
    if (!supabase) return;
    setOauthLoading(true);
    setError(null);
    try {
      const { error: oErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (oErr) throw oErr;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign in failed');
      setOauthLoading(false);
    }
  };

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="auth-panel" onClick={e => e.stopPropagation()}>
        <div className="auth-head">
          <div className="auth-brand">
            <span className="auth-sparkle"><Sparkles size={16} /></span>
            <div>
              <h3>{mode === 'signin' ? 'Sign in to WAYPOINT' : 'Create WAYPOINT Account'}</h3>
              <p>Sync journeys, delay approvals, and road alerts across all devices</p>
            </div>
          </div>
          <button className="auth-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* OAuth Button */}
        <button
          type="button"
          onClick={handleGoogleOAuth}
          disabled={oauthLoading}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '10px',
            borderRadius: '10px',
            background: 'var(--surface2)',
            border: '1px solid var(--line2)',
            color: 'var(--text)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: '14px',
            transition: '0.2s',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{oauthLoading ? 'Redirecting to Google...' : 'Continue with Google'}</span>
        </button>

        <div className="auth-divider">
          <span>OR WITH EMAIL</span>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'signin' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => { setMode('signin'); setError(null); }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === 'signup' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => { setMode('signup'); setError(null); }}
          >
            Create account
          </button>
        </div>

        {error && (
          <div className="auth-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="auth-email">Email address</label>
            <div className="auth-input-wrap">
              <Mail size={15} className="auth-input-icon" />
              <input
                id="auth-email"
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="auth-password">Password</label>
            <div className="auth-input-wrap">
              <Lock size={15} className="auth-input-icon" />
              <input
                id="auth-password"
                type="password"
                required
                placeholder="••••••••"
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            {mode === 'signup' && (
              <small className="auth-hint">A verification email will be dispatched to your inbox</small>
            )}
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? (
              <span className="auth-loading-text"><span className="auth-spinner" /> Processing...</span>
            ) : (
              <>
                <span>{mode === 'signin' ? 'Sign in' : 'Create account'}</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        <div className="auth-guest-wrap" style={{ marginTop: '16px' }}>
          <button type="button" className="auth-guest-btn" onClick={onClose}>
            Continue as Guest
          </button>
          <div className="auth-security-note">
            <ShieldCheck size={13} />
            <span>Supabase Auth & RLS encrypted</span>
          </div>
        </div>
      </div>
    </div>
  );
}
