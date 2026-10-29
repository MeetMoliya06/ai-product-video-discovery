import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import History from './components/History';
import ProductPanel from './components/ProductPanel';
import Progress, { SkeletonGrid } from './components/Progress';
import Results from './components/Results';
import SearchBar, { type SearchInput } from './components/SearchBar';
import type { Health, HistoryItem, ProgressEvent, SearchDetail, SourceReport, Video } from './types';

export default function App() {
  const [health, setHealth] = useState<Health>();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [search, setSearch] = useState<SearchDetail>();
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState({ step: 'resolve', label: 'Starting' });
  const [live, setLive] = useState<Record<string, SourceReport>>({});
  const [error, setError] = useState('');
  const esRef = useRef<EventSource>();

  const refreshHistory = useCallback(() => api.history().then(setHistory).catch(() => {}), []);
  useEffect(() => {
    api.health().then(setHealth).catch(() => setError('Cannot reach the API server. Is the backend running?'));
    refreshHistory();
    return () => esRef.current?.close();
  }, [refreshHistory]);

  const load = useCallback(async (id: string) => {
    try {
      setSearch(await api.getSearch(id));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const watch = useCallback(
    (id: string) => {
      esRef.current?.close();
      const es = api.events(id);
      esRef.current = es;
      es.onmessage = async (m) => {
        const ev: ProgressEvent = JSON.parse(m.data);
        if (ev.type === 'step') setStep({ step: ev.step ?? '', label: ev.label ?? '' });
        if (ev.type === 'source' && ev.report) setLive((l) => ({ ...l, [ev.report!.platform]: ev.report! }));
        if (ev.type === 'done' || ev.type === 'error') {
          es.close();
          setRunning(false);
          if (ev.type === 'error') setError(`Search failed: ${ev.message}. Check the link or try a different keyword.`);
          await load(id);
          refreshHistory();
        }
      };
      es.onerror = () => {
        // EventSource auto-reconnects; if the search already finished the replay delivers 'done'
      };
    },
    [load, refreshHistory],
  );

  const start = async (i: SearchInput) => {
    setError('');
    setSearch(undefined);
    setLive({});
    setStep({ step: 'resolve', label: 'Queued' });
    setRunning(true);
    try {
      const { searchId } = await api.startSearch({ query: i.query || undefined, imageDataUrl: i.imageDataUrl, options: { tiktok: i.tiktok, showSeen: i.showSeen } });
      watch(searchId);
    } catch (e) {
      setRunning(false);
      setError((e as Error).message);
    }
  };

  const openHistory = (id: string) => {
    esRef.current?.close();
    setRunning(false);
    setError('');
    void load(id);
  };

  const toggleShortlist = async (v: Video) => {
    const on = !v.shortlisted;
    setSearch((s) => s && { ...s, results: s.results.map((r) => (r.key === v.key ? { ...r, shortlisted: on } : r)) });
    try {
      await api.shortlist(v.key, on);
    } catch {
      setSearch((s) => s && { ...s, results: s.results.map((r) => (r.key === v.key ? { ...r, shortlisted: !on } : r)) });
      setError('Could not update the shortlist.');
    }
  };

  const shortlisted = search?.results.filter((r) => r.shortlisted).length ?? 0;

  return (
    <div className="layout">
      <main>
        <header>
          <div className="brand">
            <div className="logo">▶</div>
            <div>
              <h1>Product Video Discovery</h1>
              <div className="tagline">Find Instagram Reels and Meta video ads that show your exact product</div>
            </div>
          </div>
          <div className="status">
            {health && (
              <>
                <span className={`pill ${health.sourceMode === 'live' ? 'good' : 'warnp'}`}>{health.sourceMode === 'live' ? 'Live sources' : 'Fixture data'}</span>
                <span className={`pill ${health.vision ? 'good' : 'warnp'}`}>{health.vision ? 'Vision scoring' : 'Heuristic scoring'}</span>
              </>
            )}
            <a className="pill plain" href="/api/shortlist/export.csv">Export shortlist{shortlisted ? ` (${shortlisted} here)` : ''}</a>
          </div>
        </header>

        <SearchBar busy={running} tiktokAvailable={!!health?.tiktok} showExamples={!search} onSearch={start} />
        {error && <div className="banner error" role="alert">{error}</div>}
        {running && (
          <>
            <Progress step={step.step} label={step.label} sources={Object.values(live)} />
            <SkeletonGrid />
          </>
        )}

        {search && search.status === 'failed' && !running && (
          <div className="banner error">This search failed: {search.error}. Try again, or paste a different product link.</div>
        )}
        {search && search.status === 'done' && (
          <>
            {search.sourceMode === 'fixtures' && <div className="banner info">Showing synthetic fixture videos (SOURCE_MODE=fixtures). Set SOURCE_MODE=live and APIFY_TOKEN for real results.</div>}
            <ProductPanel search={search} />
            <Results search={search} onToggleShortlist={toggleShortlist} />
          </>
        )}
        {!search && !running && !error && (
          <div className="hero card">
            <h2>Find videos that show your exact product</h2>
            <p className="muted">Type a product name, paste a Shopify / Amazon / brand link, or upload a photo. We read the product image, collect videos, and score each one against it.</p>
            <div className="steps">
              <div className="step"><b><span className="n">1</span>Describe it</b><span className="muted small">Name, product link, or a photo. A photo gives the most precise matching.</span></div>
              <div className="step"><b><span className="n">2</span>We search</b><span className="muted small">20+ Instagram Reels and 20+ Meta video ads, de-duplicated against past searches.</span></div>
              <div className="step"><b><span className="n">3</span>Review scores</b><span className="muted small">Every video gets a 0–100 match score with the reason behind it.</span></div>
            </div>
          </div>
        )}
      </main>
      <History items={history} activeId={search?.id} onOpen={openHistory} />
    </div>
  );
}
