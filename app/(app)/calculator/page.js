'use client';
import { useState } from 'react';
import { Topbar } from '../../../components/Shell';
import { money } from '../../../lib/format';
import { dealModel } from '../../../lib/dealcalc';

const F = ({ label, value, onChange, suffix }) => (
  <div className="field">
    <label>{label}</label>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)} />
      {suffix ? <span className="t-sub" style={{ whiteSpace: 'nowrap' }}>{suffix}</span> : null}
    </div>
  </div>
);

export default function CalculatorPage() {
  const [v, setV] = useState({ currentArea: 2400, currentFace: 1100, currentInc: 28, proposedFace: 1050, proposedInc: 38, term: 7, efficiency: 12 });
  const set = (k) => (val) => setV((s) => ({ ...s, [k]: val }));
  const m = dealModel(v);
  const positive = m.annualSaving >= 0;

  return (
    <>
      <Topbar title="Deal Calculator" sub="Quantify the pitch — current vs proposed occupancy cost" />
      <div className="wrap" style={{ maxWidth: 880 }}>
        <div className="grid2">
          <div className="card">
            <div className="hd"><h2>Their position today</h2></div>
            <div className="bd pad">
              <div className="form-grid">
                <F label="Area (m²)" value={v.currentArea} onChange={set('currentArea')} />
                <F label="Lease term (yrs)" value={v.term} onChange={set('term')} />
                <F label="Face rent" value={v.currentFace} onChange={set('currentFace')} suffix="$/m²" />
                <F label="Incentive" value={v.currentInc} onChange={set('currentInc')} suffix="%" />
              </div>
            </div>
          </div>
          <div className="card">
            <div className="hd"><h2>Your proposal</h2><span className="tag">consolidate / relocate</span></div>
            <div className="bd pad">
              <div className="form-grid">
                <F label="Space efficiency gain" value={v.efficiency} onChange={set('efficiency')} suffix="%" />
                <F label="New area (m²)" value={m.proposedArea} onChange={() => {}} suffix="auto" />
                <F label="Proposed face" value={v.proposedFace} onChange={set('proposedFace')} suffix="$/m²" />
                <F label="Proposed incentive" value={v.proposedInc} onChange={set('proposedInc')} suffix="%" />
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ borderColor: positive ? 'rgba(52,211,153,.4)' : 'rgba(248,113,113,.4)' }}>
          <div className="hd"><h2>The number</h2><span className="tag">net effective</span></div>
          <div className="bd pad" style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div><div className="t-sub">Current cost</div><div style={{ fontSize: 20, fontWeight: 700 }}>{money(m.currentAnnual)}<span className="t-sub"> /yr</span></div></div>
            <div><div className="t-sub">Proposed cost</div><div style={{ fontSize: 20, fontWeight: 700 }}>{money(m.proposedAnnual)}<span className="t-sub"> /yr</span></div></div>
            <div>
              <div className="t-sub">{positive ? 'Annual saving' : 'Annual increase'}</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: positive ? 'var(--green)' : 'var(--red)' }}>{money(Math.abs(m.annualSaving))}<span className="t-sub"> /yr</span></div>
            </div>
            <div><div className="t-sub">Over the {v.term}-yr term</div><div style={{ fontSize: 20, fontWeight: 700, color: positive ? 'var(--green)' : 'var(--red)' }}>{money(Math.abs(m.termSaving))}</div></div>
            <div><div className="t-sub">Space released</div><div style={{ fontSize: 18, fontWeight: 700 }}>{Math.max(0, m.areaSaved).toLocaleString()} m²</div></div>
          </div>
        </div>
        <p className="t-sub">Net effective = face rent less incentive, straight-line. Pull the market face/incentive from Deal Evidence, set a realistic efficiency gain from consolidating fragmented suites, and you've got the dollar line for your opener.</p>
      </div>
    </>
  );
}
