import type { SearchDetail } from '../types';
import { api } from '../api';

export default function ProductPanel({ search }: { search: SearchDetail }) {
  const { product, analysis } = search;
  if (!product || !analysis) return null;
  const chips: [string, string[]][] = [
    ['Type', [analysis.productType]],
    ['Colours', analysis.colors],
    ['Print', analysis.prints && analysis.prints !== 'unknown' ? [analysis.prints] : []],
    ['Logos', analysis.logos],
    ['Text', analysis.textOnProduct],
    ['Material', analysis.material !== 'unknown' ? [analysis.material] : []],
    ['Shape', analysis.shape !== 'unknown' ? [analysis.shape] : []],
  ];
  const engineLabel = { vision: 'Vision model', text: 'Text-only model (no photo)', heuristic: 'Heuristic (no vision key)' }[analysis.engine];
  return (
    <section className="product card">
      {product.imageUrl ? <img src={api.thumb(product.imageUrl)} alt={product.title} /> : <div className="noimg">No product image</div>}
      <div>
        <h2>{product.title || search.input}</h2>
        {product.sourceUrl && <a href={product.sourceUrl} target="_blank" rel="noreferrer" className="muted small">{new URL(product.sourceUrl).hostname}</a>}
        <p className="muted small">{analysis.summary}</p>
        <div className="chips">
          {chips.filter(([, v]) => v.length).map(([k, v]) => (
            <span key={k} className="chip"><b>{k}</b> {v.join(', ')}</span>
          ))}
        </div>
        <p className="small muted">
          <b>Analysis:</b> {engineLabel} · <b>Hashtags:</b> {analysis.hashtags.slice(0, 8).map((h) => '#' + h).join(' ') || '—'}
        </p>
      </div>
    </section>
  );
}
