'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth, signOut } from '../lib/auth';
import { displayName } from '../lib/personal';
import { Loading } from './ui';
import AskLex from './AskLex';

const NAV = [
  { items: [
    { href: '/', label: 'Dashboard', ic: '▦' },
    { href: '/ask', label: 'Ask LEX', ic: '✦', gold: true },
    { href: '/occupiers', label: 'Leads', ic: '◉', gold: true },
    { href: '/feed', label: 'Market Feed', ic: '◈', gold: true },
  ] },
  { title: 'Reference', items: [
    { href: '/money', label: 'Pipeline $', ic: '$', gold: true },
    { href: '/diary', label: 'Lease Diary', ic: '▤' },
    { href: '/stack', label: 'Stack Plans', ic: '▥' },
    { href: '/crm', label: 'Tenants / CRM', ic: '◍' },
  ] },
  { title: 'Capture', items: [
    { href: '/capture', label: 'Scan Board', ic: '◳', gold: true },
    { href: '/card', label: 'Meeting Capture', ic: '◲', gold: true },
    { href: '/patrol', label: 'Building Patrol', ic: '◴', gold: true },
    { href: '/import-lease', label: 'Lease PDF', ic: '▤', gold: true },
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
  const [menu, setMenu] = useState(false);
  const [ask, setAsk] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => { setMenu(false); }, [pathname]);

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
    <div className={'app' + (menu ? ' menu-open' : '')}>
      <div className="mtop">
        <button className="hamb" onClick={() => setMenu((v) => !v)} aria-label="Menu">☰</button>
        <div className="mtop-mark">LEX</div>
      </div>
      <div className="scrim" onClick={() => setMenu(false)} />
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

      {/* Phone-first bottom tab bar — hidden on desktop via CSS. */}
      <nav className="tabbar" aria-label="Primary">
        <Link href="/" className={pathname === '/' ? 'on' : ''}>
          <span className="tbic">▦</span><span>Home</span>
        </Link>
        <Link href="/occupiers" className={pathname === '/occupiers' ? 'on' : ''}>
          <span className="tbic">◉</span><span>Leads</span>
        </Link>
        <Link href="/capture" className="tbscan" aria-label="Scan a board">
          <span className="tbscan-ic">◳</span>
        </Link>
        <Link href="/feed" className={pathname === '/feed' ? 'on' : ''}>
          <span className="tbic">◈</span><span>Feed</span>
        </Link>
        <button type="button" className={'tbmore' + (menu ? ' on' : '')} onClick={() => setMenu((v) => !v)}>
          <span className="tbic">☰</span><span>More</span>
        </button>
      </nav>

      {/* Floating Ask LEX launcher — available on every screen */}
      <button className="asklex-fab" onClick={() => setAsk(true)} aria-label="Ask LEX">✦</button>
      {ask ? (
        <div className="asklex-overlay" onClick={() => setAsk(false)}>
          <div className="asklex-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="asklex-sheethd">
              <b>Ask LEX</b>
              <button className="hamb" onClick={() => setAsk(false)} aria-label="Close">✕</button>
            </div>
            <AskLex />
          </div>
        </div>
      ) : null}
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
