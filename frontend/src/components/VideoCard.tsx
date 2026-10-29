import { useState } from 'react';
import { api } from '../api';
import type { Video } from '../types';

const BADGE = { instagram: 'Instagram Reel', meta: 'Meta Ad', tiktok: 'TikTok' } as const;

export default function VideoCard({ v, onToggleShortlist }: { v: Video; onToggleShortlist: (v: Video) => void }) {
  const [playing, setPlaying] = useState(false);
  const [broken, setBroken] = useState(false);
  const tone = v.score >= 80 ? 'high' : v.score >= 60 ? 'mid' : 'low';
  const canPlay = !!v.videoUrl && v.platform === 'meta'; // IG CDN video URLs reject hotlinking; link out instead

  return (
    <article className="vcard card">
      <div className="thumb">
        {playing && v.videoUrl ? (
          <video src={v.videoUrl} controls autoPlay playsInline onError={() => setPlaying(false)} />
        ) : broken ? (
          <div className="noimg">Thumbnail unavailable</div>
        ) : (
          <img src={api.thumb(v.thumbnailUrl)} alt="" loading="lazy" onError={() => setBroken(true)} />
        )}
        <span className={`badge ${v.platform}`}>{BADGE[v.platform]}</span>
        <span className={`score ${tone}`} title={`Match score ${v.score}/100`}>{v.score}</span>
        {v.status === 'weak' && <span className="flag weak">weak match</span>}
        {v.previouslySeen && <span className="flag seen">seen before</span>}
      </div>
      <div className="body">
        <p className="reason" title="Why this score">💡 {v.reason}</p>
        <p className="caption">{v.caption || <i className="muted">No caption</i>}</p>
        <div className="meta small muted">
          {v.advertiser && <span>{v.advertiser}</span>}
          {v.postedAt && <span>{new Date(v.postedAt).toLocaleDateString()}</span>}
        </div>
        <div className="actions">
          <a href={v.url} target="_blank" rel="noreferrer">Open original ↗</a>
          {canPlay && <button className="link" onClick={() => setPlaying((p) => !p)}>{playing ? 'Stop' : '▶ Play'}</button>}
          <button className="link" onClick={() => onToggleShortlist(v)}>{v.shortlisted ? '★ Saved' : '☆ Save'}</button>
        </div>
      </div>
    </article>
  );
}
