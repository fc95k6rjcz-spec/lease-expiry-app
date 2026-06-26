'use client';
import { useEffect, useState } from 'react';

// One-time "use LEX as an app, or in the browser?" prompt for iPhone.
// - Skips entirely when already launched from the home screen (standalone).
// - Only shown on iOS Safari, where install = Add to Home Screen.
// - Remembers the choice so it never nags again on this device.
const KEY = 'lex_install_choice_v1';

function isStandalone() {
  if (typeof window === 'undefined') return true;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS 13+ reports as Mac, so also check for touch.
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function InstallChoice() {
  const [show, setShow] = useState(false);
  const [steps, setSteps] = useState(false);

  useEffect(() => {
    if (isStandalone() || !isIOS()) return; // already an app, or not an iPhone
    try { if (localStorage.getItem(KEY)) return; } catch {}
    setShow(true);
  }, []);

  if (!show) return null;

  const choose = (choice) => {
    try { localStorage.setItem(KEY, choice); } catch {}
    setShow(false);
  };

  return (
    <div className="installgate" role="dialog" aria-modal="true" aria-label="Install LEX">
      <div className="installcard">
        <div className="lexmark" style={{ fontSize: 30, letterSpacing: 6 }}>LEX</div>

        {!steps ? (
          <>
            <p className="ig-sub">How do you want to use LEX on this phone?</p>
            <button className="btn primary block" onClick={() => setSteps(true)}>
              Add to home screen
            </button>
            <button className="btn block" style={{ marginTop: 10 }} onClick={() => choose('safari')}>
              Keep using the browser
            </button>
            <p className="ig-fine">Installing gives you a full-screen app icon — no Safari bars, opens instantly.</p>
          </>
        ) : (
          <>
            <p className="ig-sub">Add LEX to your home screen</p>
            <ol className="ig-steps">
              <li>Tap the <b>Share</b> button — the square with an up-arrow in Safari’s toolbar.</li>
              <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
              <li>Tap <b>Add</b>. LEX now opens full-screen from your home screen.</li>
            </ol>
            <button className="btn primary block" onClick={() => choose('install')}>Got it</button>
          </>
        )}
      </div>
    </div>
  );
}
