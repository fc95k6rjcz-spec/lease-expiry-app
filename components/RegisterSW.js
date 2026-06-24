'use client';
import { useEffect } from 'react';

// Registers the service worker so LEX is installable / works offline-ish.
export default function RegisterSW() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const reg = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
    if (document.readyState === 'complete') reg();
    else window.addEventListener('load', reg, { once: true });
  }, []);
  return null;
}
