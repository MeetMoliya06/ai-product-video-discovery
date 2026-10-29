import type { Health, HistoryItem, SearchDetail } from './types';

export class ApiError extends Error {}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  health: () => fetch('/api/health').then(j<Health>),
  startSearch: (b: { query?: string; imageDataUrl?: string; options: { tiktok: boolean; showSeen: boolean } }) =>
    fetch('/api/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(j<{ searchId: string }>),
  getSearch: (id: string) => fetch(`/api/search/${id}`).then(j<SearchDetail>),
  history: () => fetch('/api/history').then(j<HistoryItem[]>),
  shortlist: (key: string, on: boolean) => fetch(`/api/shortlist/${encodeURIComponent(key)}`, { method: on ? 'PUT' : 'DELETE' }).then(j<{ ok: boolean }>),
  events: (id: string) => new EventSource(`/api/search/${id}/events`),
  thumb: (url: string) => (url.startsWith('data:') ? url : `/api/thumb?url=${encodeURIComponent(url)}`),
};
