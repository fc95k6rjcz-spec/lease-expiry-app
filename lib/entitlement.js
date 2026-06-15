'use client';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Reads the signed-in user's profile and decides whether they have access.
// Entitled if status is 'active', or 'trialing' and the trial hasn't lapsed.
export function useEntitlement() {
  const [state, setState] = useState({ loading: true, entitled: true, status: null, trialEndsAt: null });

  useEffect(() => {
    let on = true;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('status, trial_ends_at, current_period_end')
        .maybeSingle();
      if (!on) return;
      if (error || !data) {
        // Fail open — never lock someone out on a read error.
        setState({ loading: false, entitled: true, status: null, trialEndsAt: null });
        return;
      }
      const now = Date.now();
      const trialing = data.status === 'trialing' && data.trial_ends_at && new Date(data.trial_ends_at).getTime() > now;
      const entitled = data.status === 'active' || trialing;
      setState({ loading: false, entitled, status: data.status, trialEndsAt: data.trial_ends_at });
    })();
    return () => { on = false; };
  }, []);

  return state;
}

export function trialDaysLeft(trialEndsAt) {
  if (!trialEndsAt) return 0;
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000));
}
