import type { SourceReport } from '../types';

const STEPS = [
  ['resolve', 'Fetching product'],
  ['analyse', 'Analysing image'],
  ['collect', 'Searching & scoring'],
  ['save', 'Saving'],
] as const;

const NAMES = { instagram: 'Instagram Reels', meta: 'Meta Ad Library', tiktok: 'TikTok' } as const;

export default function Progress({ step, label, sources }: { step: string; label: string; sources: SourceReport[] }) {
  const norm = step === 'analysed' ? 'analyse' : step;
  const active = STEPS.findIndex(([k]) => k === norm);
  return (
    <div className="progress card" aria-live="polite">
      <ol>
        {STEPS.map(([k, name], i) => (
          <li key={k} className={i < active ? 'done' : i === active ? 'active' : ''}>
            <span className="dot">{i < active ? '✓' : i + 1}</span>
            {name}
          </li>
        ))}
      </ol>
      <p className="muted small" style={{ margin: 0 }}>{label}…</p>
      {sources.length > 0 && (
        <div className="live-counts">
          {sources.map((s) => (
            <div key={s.platform} className="lc">
              <b>{NAMES[s.platform]}</b> <span className="muted">{s.matches}/{s.target} matches · {s.fetched} fetched</span>
              <div className={`meter ${s.matches >= s.target ? '' : 'warn'}`}><i style={{ width: `${Math.min(100, (s.matches / s.target) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SkeletonGrid({ n = 8 }: { n?: number }) {
  return (
    <div className="grid" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="vcard card sk-card">
          <div className="thumb skeleton" />
          <div className="sk-line skeleton" style={{ width: '90%' }} />
          <div className="sk-line skeleton" style={{ width: '60%' }} />
        </div>
      ))}
    </div>
  );
}
