import { api } from '../api';
import type { HistoryItem } from '../types';

export default function History({ items, activeId, onOpen }: { items: HistoryItem[]; activeId?: string; onOpen: (id: string) => void }) {
  return (
    <aside className="history card">
      <h3>Search history <span className="muted small">{items.length || ''}</span></h3>
      {items.length === 0 && <p className="muted small">No searches yet. Your past searches and their results will appear here.</p>}
      <ul>
        {items.map((h) => (
          <li key={h.id}>
            <button className={h.id === activeId ? 'active' : ''} onClick={() => onOpen(h.id)}>
              <span className="h-ico">{h.productImage ? <img src={api.thumb(h.productImage)} alt="" /> : h.inputType === 'url' ? '🔗' : '🔎'}</span>
              <span className="h-text">
                <span className="h-title">{h.productTitle || h.input}</span>
                <span className="muted small">{new Date(h.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                {h.status === 'done' ? (
                  <span className="h-counts">{h.sources.map((s) => <i key={s.platform}>{s.platform === 'instagram' ? 'IG' : s.platform === 'meta' ? 'Meta' : 'TT'} {s.matches + s.weak}</i>)}</span>
                ) : (
                  <span className="small">{h.status}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
