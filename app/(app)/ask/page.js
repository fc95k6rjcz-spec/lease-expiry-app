'use client';
import { Topbar } from '../../../components/Shell';
import AskLex from '../../../components/AskLex';

export default function AskPage() {
  return (
    <>
      <Topbar title="Ask LEX" sub="Chat with your lead intelligence — grounded in live scores and signals" />
      <div className="wrap" style={{ maxWidth: 820 }}>
        <div className="card" style={{ height: 'calc(100dvh - 170px)', minHeight: 380, display: 'flex' }}>
          <div className="bd" style={{ padding: 0, flex: 1, display: 'flex', minHeight: 0 }}>
            <AskLex />
          </div>
        </div>
      </div>
    </>
  );
}
