'use client';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// A single browser client, reused across the app. Session is persisted in
// localStorage by default, so the user stays signed in across reloads.
export const supabase = createClient(url || 'http://localhost', anon || 'public-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const isConfigured = Boolean(url && anon);
