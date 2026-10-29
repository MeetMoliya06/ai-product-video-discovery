import { EventEmitter } from 'node:events';
import type { ProgressEvent } from './types.js';

/** In-process progress bus with a replay buffer so late SSE subscribers see earlier steps. */
const bus = new EventEmitter();
bus.setMaxListeners(200);
const buffers = new Map<string, ProgressEvent[]>();

export function emit(searchId: string, ev: Omit<ProgressEvent, 'at'>) {
  const full = { ...ev, at: Date.now() };
  const buf = buffers.get(searchId) ?? [];
  buf.push(full);
  buffers.set(searchId, buf);
  if (buffers.size > 100) buffers.delete(buffers.keys().next().value!); // bound memory
  bus.emit(searchId, full);
}

export function subscribe(searchId: string, fn: (e: ProgressEvent) => void): () => void {
  for (const e of buffers.get(searchId) ?? []) fn(e);
  bus.on(searchId, fn);
  return () => bus.off(searchId, fn);
}
