'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth, signOut } from '../lib/auth';
import { displayName } from '../lib/personal';
import { Loading } from './ui';

const NAV = [
  { items: [
    { href: '/', label: 'Dashboard', ic: '▦' },
    { href: '/occupiers', label: 'Leads', ic: '◉', gold: true },
    { href: '/feed', label: 'Market Feed', ic: '◈', gold: true },
  ] },
  { title: 'Reference', items: [
    { href: '/diary', label: 'Lease Diary', ic: '▤' },
    { href: '/stack', label: 'Stack Plans', ic: '▥' },
    { href: '/crm', label: 'Tenants / CRM', ic: '◍' },
  ] },
  { title: 'Capture', items: [
    { href: '/capture', label: 'Scan Board', ic: '◳', gold: true },
    { href: '/review', label: 'Review Queue', ic: '☑', gold: true },
    { href: '/research', label: 'Bulk Research', ic: '⌕' },
  ] },
  // Hidden from the menu but still live at their URLs — re-add a line to bring one back:
  //   /leads (Lead Finder)  /opportunities  /targets  → consolidated into /occupiers ("Leads")
  //   /signals  /market (Office Markets)  /evidence (Deal Evidence)
  //   /pipeline  /analytics  /calculator  /metrics  /buildings  /import
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
        <div className="logo" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
          <div className="lexmark">LEX</div>
          <div className="lexsub">Lease Expiry</div>
          <div className="lextag">Signals for expiring leases</div>
        </div>
        <nav className="nav">
          {NAV.map((sec, si) => (
            <div key={si}>
              {sec.title ? <div className="navsec">{sec.title}</div> : null}
              {sec.items.map((n) => (
                <Link key={n.href} href={n.href} className={(pathname === n.href ? 'on' : '') + (n.gold ? ' gold' : '')}>
                  <span className="ic">{n.ic}</span> {n.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="foot">
          {displayName(user.email)}’s desk<br />
          <span style={{ color: '#5d6b82' }}>{user.email}</span>
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
      <main className="main">{children}</main>
    </div>
  );
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
