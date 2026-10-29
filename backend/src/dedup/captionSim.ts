export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#@]\w+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function trigrams(s: string): Set<string> {
  const t = ` ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

/** Jaccard similarity over character trigrams of normalized text (0..1). */
export function captionSimilarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na.length < 20 || nb.length < 20) return na && na === nb ? 1 : 0; // too short to compare reliably
  const ta = trigrams(na);
  const tb = trigrams(nb);
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return inter / (ta.size + tb.size - inter);
}
