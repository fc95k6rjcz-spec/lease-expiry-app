'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth, signOut } from '../lib/auth';
import { useEntitlement, trialDaysLeft } from '../lib/entitlement';
import { Loading } from './ui';

const NAV = [
  { href: '/', label: 'Dashboard', ic: '▦' },
  { href: '/diary', label: 'Lease Diary', ic: '▤' },
  { href: '/stack', label: 'Stack Plans', ic: '▥' },
  { href: '/crm', label: 'Tenants / CRM', ic: '◍' },
  { href: '/signals', label: 'Signals', ic: '◆' },
  { href: '/buildings', label: 'Buildings', ic: '▣' },
  { href: '/import', label: 'Import / Export', ic: '⇅' },
  { href: '/billing', label: 'Billing', ic: '◈' },
];

export default function Shell({ children }) {
  const { user, loading, isConfigured } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (!isConfigured) {
    return (
      <div className="authwrap">
        <div className="authcard">
          <h1>Not configured</h1>
          <p className="s">
            Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your environment (Vercel → Settings →
            Environment Variables, or a local <code>.env.local</code>), then redeploy.
          </p>
        </div>
      </div>
    );
  }
  if (loading) return <Loading />;
  if (!user) return <Loading />;

  return (
    <div className="app">
      <aside className="side">
        <div className="logo">
          <img src="/black-rain.png" alt="Black Rain" className="sidelogo" />
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={pathname === n.href ? 'on' : ''}>
              <span className="ic">{n.ic}</span> {n.label}
            </Link>
          ))}
        </nav>
        <div className="foot">
          Signed in as<br />
          {user.email}
          <button
            onClick={async () => {
              await signOut();
              router.replace('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Entitle pathname={pathname} />
        {children}
      </main>
    </div>
  );
}

function Entitle({ pathname }) {
  const { loading, entitled, status, trialEndsAt } = useEntitlement();
  if (loading || entitled || pathname === '/billing') return null;
  const why = status === 'trialing' ? 'Your trial has ended.' :
    status === 'past_due' ? 'Your payment is past due.' :
    status === 'canceled' ? 'Your subscription is canceled.' : 'No active subscription.';
  return (
    <div style={{ padding: '12px 28px 0' }}>
      <div className="banner">
        {why} <Link href="/billing" style={{ fontWeight: 700 }}>Subscribe to keep full access →</Link>
      </div>
    </div>
  );
}

export function TrialPill() {
  const { status, trialEndsAt } = useEntitlement();
  if (status !== 'trialing') return null;
  return <span className="pill p-amber">Trial · {trialDaysLeft(trialEndsAt)}d left</span>;
}

export function Topbar({ title, sub, children }) {
  return (
    <div className="top">
      <div>
        <h1>{title}</h1>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {children ? <div className="actions">{children}</div> : null}
    </div>
  );
}
