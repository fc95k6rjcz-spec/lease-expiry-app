'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, useAuth } from '../../lib/auth';
import { Field } from '../../components/ui';

export default function LoginPage() {
  const { user, loading, isConfigured } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [loading, user, router]);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const { error } = await signIn(email, pw);
      if (error) throw error;
      router.replace('/');
    } catch (e2) {
      setErr(e2.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="authwrap">
      <form className="authcard" onSubmit={submit}>
        <div className="authlex">
          <div className="lexmark">LEX</div>
          <div className="lexsub">Lease Expiry</div>
          <div className="lextag">Signals for expiring tenant leases</div>
        </div>
        {!isConfigured && (
          <div className="err">Supabase env vars are missing — set them in Vercel and redeploy.</div>
        )}
        {err && <div className="err">{err}</div>}
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
            autoComplete="current-password"
          />
        </Field>
        <button className="btn primary" disabled={busy}>
          {busy ? 'Please wait…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
