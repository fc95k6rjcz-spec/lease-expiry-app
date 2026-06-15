import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_missing');

export async function POST(req) {
  try {
    const { interval } = await req.json().catch(() => ({}));
    const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
    if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });

    // Validate the caller via their Supabase session token.
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

    const admin = supabaseAdmin();
    let { data: prof } = await admin.from('profiles').select('*').eq('id', user.id).single();

    // Ensure a Stripe customer exists for this user.
    let customer = prof?.stripe_customer_id;
    if (!customer) {
      const c = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } });
      customer = c.id;
      await admin.from('profiles').update({ stripe_customer_id: customer }).eq('id', user.id);
    }

    const price = interval === 'year'
      ? process.env.STRIPE_PRICE_YEARLY
      : process.env.STRIPE_PRICE_MONTHLY;
    if (!price) return Response.json({ error: 'price not configured' }, { status: 500 });

    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || '';
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price, quantity: 1 }],
      client_reference_id: user.id,
      subscription_data: { metadata: { user_id: user.id } },
      allow_promotion_codes: true,
      success_url: `${origin}/billing?ok=1`,
      cancel_url: `${origin}/billing`,
    });

    return Response.json({ url: session.url });
  } catch (e) {
    return Response.json({ error: e.message || 'checkout failed' }, { status: 500 });
  }
}
