'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, signUp, useAuth } from '../../lib/auth';
import { Field } from '../../components/ui';

export default function LoginPage() {
  const { user, loading, isConfigured } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState('in'); // 'in' | 'up'
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [loading, user, router]);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      if (mode === 'in') {
        const { error } = await signIn(email, pw);
        if (error) throw error;
        router.replace('/');
      } else {
        const { data, error } = await signUp(email, pw);
        if (error) throw error;
        if (data?.session) router.replace('/');
        else setMsg('Account created. Check your email to confirm, then sign in.');
      }
    } catch (e2) {
      setErr(e2.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="authwrap">
      <form className="authcard" onSubmit={submit}>
        <img src="/black-rain.png" alt="Black Rain — Lease Expiry Agent" className="authlogo" />
        {!isConfigured && (
          <div className="err">Supabase env vars are missing — set them in Vercel and redeploy.</div>
        )}
        {err && <div className="err">{err}</div>}
        {msg && <div className="ok">{msg}</div>}
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          />
        </Field>
        <button className="btn primary" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
        <div className="alt">
          {mode === 'in' ? (
            <>
              No account?{' '}
              <button type="button" onClick={() => setMode('up')}>
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" onClick={() => setMode('in')}>
                Sign in
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
