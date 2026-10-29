import { useMemo, useState } from 'react';
import type { Platform, SearchDetail, Video } from '../types';
import VideoCard from './VideoCard';

const PAGE = 24;

const NAMES: Record<Platform, string> = { instagram: 'Instagram Reels', meta: 'Meta Ad Library', tiktok: 'TikTok' };

interface Props {
  search: SearchDetail;
  onToggleShortlist: (v: Video) => void;
}

export default function Results({ search, onToggleShortlist }: Props) {
  const platforms = search.sources.map((s) => s.platform);
  const [tab, setTab] = useState<Platform>(platforms[0] ?? 'instagram');
  const [sort, setSort] = useState<'score' | 'newest'>('score');
  const [minScore, setMinScore] = useState(0);
  const [hideWeak, setHideWeak] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const source = search.sources.find((s) => s.platform === tab);
  const videos = useMemo(() => {
    const list = search.results.filter((v) => v.platform === tab && v.score >= minScore && !(hideWeak && v.status === 'weak'));
    return [...list].sort((a, b) => (sort === 'score' ? b.score - a.score : +new Date(b.postedAt ?? 0) - +new Date(a.postedAt ?? 0)));
  }, [search.results, tab, sort, minScore, hideWeak]);

  return (
    <section>
      <div className="tabs" role="tablist">
        {search.sources.map((s) => {
          const ok = s.matches >= s.target;
          return (
            <button key={s.platform} role="tab" aria-selected={tab === s.platform} className={tab === s.platform ? 'tab active' : 'tab'} onClick={() => { setTab(s.platform); setLimit(PAGE); }}>
              <span className="t-top">{NAMES[s.platform]}<span className={`count ${ok ? 'ok' : s.matches > 0 ? 'warn' : 'bad'}`}>{s.matches}/{s.target}</span></span>
              <span className={`meter ${ok ? '' : 'warn'}`}><i style={{ width: `${Math.min(100, (s.matches / s.target) * 100)}%` }} /></span>
              <span className="t-sub">{ok ? 'Target met' : 'Below target'}{s.weak > 0 ? ` · +${s.weak} weak` : ''}</span>
            </button>
          );
        })}
      </div>

      {source && <SourceStatus s={source} />}

      <div className="filters">
        <label>Sort <select value={sort} onChange={(e) => setSort(e.target.value as any)}><option value="score">Match score</option><option value="newest">Newest first</option></select></label>
        <label>Min score <input type="range" min={0} max={100} step={5} value={minScore} onChange={(e) => setMinScore(+e.target.value)} /> {minScore}</label>
        <label><input type="checkbox" checked={hideWeak} onChange={(e) => setHideWeak(e.target.checked)} /> Hide weak matches</label>
        <span className="muted small spacer">{videos.length} videos · Match ≥ {search.thresholds.match} · weak {search.thresholds.weak}–{search.thresholds.match - 1} · below {search.thresholds.weak} discarded</span>
      </div>

      {videos.length === 0 ? (
        <div className="empty card">
          <h3>No videos to show</h3>
          <p className="muted">
            {source && source.matches + source.weak === 0
              ? 'This source returned nothing usable. Try a broader keyword, tick "Show previously seen", upload a clearer product photo, or retry in a few minutes.'
              : 'Your filters hide every result. Lower the minimum score or untick "Hide weak matches".'}
          </p>
        </div>
      ) : (
        <div className="grid">{videos.slice(0, limit).map((v) => <VideoCard key={v.key} v={v} onToggleShortlist={onToggleShortlist} />)}</div>
      )}
      {videos.length > limit && (
        <div className="more"><button onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, videos.length - limit)} more · {videos.length - limit} remaining</button></div>
      )}
    </section>
  );
}

const STATE_TEXT: Record<string, string> = {
  ok: 'Target met',
  partial: 'Shortfall',
  blocked: 'Blocked / quota',
  failed: 'Source failed',
  running: 'Running',
  disabled: 'Disabled',
  pending: 'Pending',
};

function SourceStatus({ s }: { s: SearchDetail['sources'][number] }) {
  const bad = s.state !== 'ok';
  return (
    <div className={`source-status ${bad ? 'warn' : 'ok'}`}>
      <b>{STATE_TEXT[s.state]}:</b> {s.matches}/{s.target} strong matches
      <span className="muted small"> · {s.fetched} fetched · {s.duplicatesRemoved} duplicates removed · {s.seenRemoved} already seen · {s.discarded} below threshold · {s.rounds} query round(s)</span>
      {s.notes.map((n, i) => <div key={i} className="small">{n}</div>)}
    </div>
  );
}
