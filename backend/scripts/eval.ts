/**
 * Runs the 5+ product test set against a running backend and writes docs/TEST_RESULTS.md.
 *   npm run eval                      (API at http://localhost:8080)
 *   API=http://localhost:8080 npm run eval
 * Products flagged `repeat` are searched twice to show the repeat search returns new videos.
 */
import { writeFileSync } from 'node:fs';

const API = process.env.API ?? 'http://localhost:8080';
const PRODUCTS: { q: string; repeat: boolean }[] = [
  { q: 'oversized graphic tee', repeat: true },
  { q: 'protein dark chocolate', repeat: true },
  { q: 'insulated stainless steel tumbler', repeat: false },
  { q: 'https://www.allbirds.com/products/mens-tree-runners', repeat: false },
  { q: 'https://www.glossier.com/products/balm-dotcom', repeat: false },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function search(query: string) {
  const start = await fetch(`${API}/api/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }) }).then((r) => r.json());
  if (!start.searchId) throw new Error(JSON.stringify(start));
  const t0 = Date.now();
  for (;;) {
    const d = await fetch(`${API}/api/search/${start.searchId}`).then((r) => r.json());
    if (d.status === 'done' || d.status === 'failed') return { d, secs: (Date.now() - t0) / 1000 };
    if (Date.now() - t0 > 600_000) throw new Error('timeout');
    await sleep(1500);
  }
}

const health = await fetch(`${API}/api/health`).then((r) => r.json());
const lines: string[] = [
  '# Test results',
  '',
  `Generated ${new Date().toISOString()} · source mode: **${health.sourceMode}** · scoring: **${health.vision ? 'vision model' : 'heuristic (no vision key)'}**`,
  '',
  health.sourceMode === 'fixtures' || !health.vision
    ? '> ⚠️ This run used synthetic fixture videos and/or heuristic scoring. It demonstrates the pipeline, counts and de-duplication only; it is **not** evidence of visual accuracy. Re-run with `SOURCE_MODE=live`, `APIFY_TOKEN` and `ANTHROPIC_API_KEY` set for real accuracy numbers.'
    : '',
  '',
  '| Product | Run | IG matches / weak | Meta matches / weak | Fetched (IG/Meta) | Dups removed | Seen removed | Below threshold | Time | New vs previous run |',
  '|---|---|---|---|---|---|---|---|---|---|',
];
const examples: string[] = [];

for (const { q, repeat } of PRODUCTS) {
  let prev = new Set<string>();
  for (const run of repeat ? [1, 2] : [1]) {
    const { d, secs } = await search(q);
    const by = (p: string) => d.sources.find((s: any) => s.platform === p) ?? { matches: 0, weak: 0, fetched: 0, duplicatesRemoved: 0, seenRemoved: 0, discarded: 0 };
    const ig = by('instagram');
    const meta = by('meta');
    const keys = new Set<string>(d.results.map((r: any) => r.key));
    const overlap = [...keys].filter((k) => prev.has(k)).length;
    lines.push(`| ${q.replace('https://', '')} | ${run} | ${ig.matches} / ${ig.weak} | ${meta.matches} / ${meta.weak} | ${ig.fetched}/${meta.fetched} | ${ig.duplicatesRemoved + meta.duplicatesRemoved} | ${ig.seenRemoved + meta.seenRemoved} | ${ig.discarded + meta.discarded} | ${secs.toFixed(0)}s | ${run === 1 ? '—' : `${keys.size - overlap} new, ${overlap} repeated`} |`);
    if (run === 1) {
      const sorted = [...d.results].sort((a: any, b: any) => b.score - a.score);
      const pick = (r: any) => `- **${r.score}** [${r.platform}] ${r.url} — ${r.reason}`;
      examples.push(`### ${q.replace('https://', '')}`, '', `Detected: ${d.analysis?.productType} · colours: ${(d.analysis?.colors ?? []).join(', ') || '—'} · engine: ${d.analysis?.engine}`, '', 'Best matches:', ...sorted.slice(0, 2).map(pick), '', 'Worst kept / borderline:', ...sorted.slice(-2).map(pick), '');
    }
    prev = keys;
  }
}
lines.push('', '## Example good and bad matches (run 1)', '', ...examples);
writeFileSync(new URL('../../docs/TEST_RESULTS.md', import.meta.url), lines.join('\n'));
console.log(lines.join('\n'));
