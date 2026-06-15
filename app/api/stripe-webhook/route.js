import Stripe from 'stripe';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_missing');

async function syncSubscription(sub) {
  const admin = supabaseAdmin();
  const cpe = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
  await admin
    .from('profiles')
    .update({
      stripe_subscription_id: sub.id,
      plan: 'pro',
      status: sub.status, // active | trialing | past_due | canceled | unpaid
      current_period_end: cpe,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', sub.customer);
}

export async function POST(req) {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return new Response(`Webhook signature error: ${e.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;
        if (s.subscription) {
          const sub = await stripe.subscriptions.retrieve(s.subscription);
          await syncSubscription(sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await syncSubscription(event.data.object);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    return new Response(`Handler error: ${e.message}`, { status: 500 });
  }

  return Response.json({ received: true });
}
