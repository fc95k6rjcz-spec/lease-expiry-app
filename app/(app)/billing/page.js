'use client';
import { useEffect, useState } from 'react';
import { Topbar } from '../../../components/Shell';
import { supabase } from '../../../lib/supabase';
import { useEntitlement, trialDaysLeft } from '../../../lib/entitlement';

const PLANS = [
  { interval: 'month', label: 'Monthly', price: 'A$349', per: 'per user / month' },
  { interval: 'year', label: 'Annual', price: 'A$3,490', per: 'per user / year', note: '2 months free' },
];

export default function BillingPage() {
  const ent = useEntitlement();
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('ok')) {
      setMsg('Subscription started — thanks! It may take a few seconds to activate.');
    }
  }, []);

  async function subscribe(interval) {
    setBusy(interval);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ interval }),
      });
      const json = await res.json();
      if (json.url) window.location.href = json.url;
      else setMsg(json.error || 'Could not start checkout.');
    } catch (e) {
      setMsg(e.message || 'Could not start checkout.');
    } finally {
      setBusy('');
    }
  }

  const statusLabel =
    ent.status === 'active' ? 'Active — Pro' :
    ent.status === 'trialing' ? `Trial — ${trialDaysLeft(ent.trialEndsAt)} days left` :
    ent.status === 'past_due' ? 'Past due' :
    ent.status === 'canceled' ? 'Canceled' : 'No subscription';

  return (
    <>
      <Topbar title="Billing" sub="Plan & subscription" />
      <div className="wrap" style={{ maxWidth: 760 }}>
        {msg && <div className="banner info">{msg}</div>}
        <div className="card">
          <div className="hd"><h2>Current plan</h2><span className="tag">{statusLabel}</span></div>
          <div className="bd pad" style={{ color: 'var(--muted)', fontSize: 13 }}>
            Black Rain Pro — full lease diary, tenant CRM, stack plans, expansion signals and the weekly auto-scan.
            {ent.status === 'active' ? ' Manage or cancel anytime from the Stripe receipt emails.' : ''}
          </div>
        </div>

        {ent.status !== 'active' && (
          <div className="bgrid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {PLANS.map((p) => (
              <div key={p.interval} className="bcard" style={{ cursor: 'default' }}>
                <h3>{p.label}{p.note ? <span className="pill p-green" style={{ marginLeft: 8 }}>{p.note}</span> : null}</h3>
                <div style={{ fontSize: 28, fontWeight: 800, margin: '8px 0 2px', color: '#f1f6fc' }}>{p.price}</div>
                <div className="addr">{p.per}</div>
                <button className="btn primary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                        disabled={!!busy} onClick={() => subscribe(p.interval)}>
                  {busy === p.interval ? 'Starting…' : 'Subscribe'}
                </button>
              </div>
            ))}
          </div>
        )}
        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 16 }}>
          Secure checkout by Stripe. GST handled automatically. Prices shown are examples — set the real amounts on your Stripe products.
        </p>
      </div>
    </>
  );
}
