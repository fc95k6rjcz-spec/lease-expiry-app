# Black Rain — Stripe billing setup

Subscriptions with a 14-day free trial, a Checkout flow, a webhook that syncs status to Supabase, a `/billing` page, and a soft "subscribe" banner when a trial lapses. Your existing users are grandfathered as **active**, so you're never locked out.

## 1. Database (already applied)
`supabase/07_billing.sql` created the `profiles` table, RLS, the signup trigger (auto 14-day trial), and grandfathered current users. If you ever recreate the DB, run that file.

## 2. Create products in Stripe
Stripe Dashboard → **Product catalogue** → add a product **"Black Rain Pro"** with two recurring prices:
- Monthly (e.g. A$349 / month) → copy the price id (`price_…`) → `STRIPE_PRICE_MONTHLY`
- Yearly (e.g. A$3,490 / year) → `STRIPE_PRICE_YEARLY`

(Adjust amounts to whatever you want; update the display text in `app/(app)/billing/page.js` to match.)

## 3. Add the webhook
Stripe → **Developers → Webhooks → Add endpoint**:
- URL: `https://YOUR-APP.vercel.app/api/stripe-webhook`
- Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
- Copy the **Signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`

## 4. Environment variables (Vercel → Settings → Environment Variables)
Add for Production + Preview:
```
STRIPE_SECRET_KEY=sk_live_…           (or sk_test_… while testing)
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PRICE_MONTHLY=price_…
STRIPE_PRICE_YEARLY=price_…
NEXT_PUBLIC_APP_URL=https://YOUR-APP.vercel.app
SUPABASE_SERVICE_ROLE_KEY=…           (the secret key — the billing routes need it)
```
You already have the two `NEXT_PUBLIC_SUPABASE_*` vars.

## 5. Deploy
Push to GitHub (Vercel installs `stripe` and rebuilds automatically):
```
git add -A && git commit -m "Stripe billing" && git push
```

## How it works
- New signup → trigger creates a `profiles` row with a 14-day trial → full access.
- `/billing` → **Subscribe** → `POST /api/checkout` creates a Stripe Checkout Session → redirect to Stripe.
- On payment, Stripe calls `/api/stripe-webhook` → it verifies the signature and updates `profiles.status` (active / past_due / canceled) + period end via the service-role key.
- The app reads `profiles` (RLS: each user sees only their own) to decide access. Trial lapsed / canceled → a banner prompts re-subscribe.

## Testing
Use Stripe **test mode** keys and card `4242 4242 4242 4242` (any future expiry / CVC). The webhook can be tested locally with the Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe-webhook`.

## Making it a hard gate (optional)
Right now an expired account still sees the app behind a banner (so a bug can't lock you out). To hard-gate, in `components/Shell.js` change the `Entitle` component to `router.replace('/billing')` instead of rendering a banner.
