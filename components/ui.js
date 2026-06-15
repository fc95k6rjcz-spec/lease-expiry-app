'use client';
import { useEffect } from 'react';

export function Pill({ cls, children }) {
  return <span className={'pill ' + (cls || 'p-slate')}>{children}</span>;
}

export function Drawer({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer">
        <div className="dh">
          <div>
            <h3>{title}</h3>
            {subtitle ? <div className="t-sub">{subtitle}</div> : null}
          </div>
          <button className="x" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="db">{children}</div>
      </aside>
    </>
  );
}

export function Modal({ title, onClose, onSubmit, submitting, submitLabel = 'Save', children }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="box"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="mh">
          <h3>{title}</h3>
          <button type="button" className="x" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="mb">{children}</div>
        <div className="mf">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={submitting}>
            {submitting ? 'Saving…' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

// Small controlled field helpers for forms
export function Field({ label, full, children }) {
  return (
    <div className={'field' + (full ? ' full' : '')}>
      <label>{label}</label>
      {children}
    </div>
  );
}

export function Loading() {
  return (
    <div className="loadwrap">
      <div className="spin" />
    </div>
  );
}
