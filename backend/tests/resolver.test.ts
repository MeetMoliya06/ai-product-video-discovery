import { describe, expect, it } from 'vitest';
import { extractProductMeta } from '../src/resolver/productResolver.js';

describe('extractProductMeta', () => {
  it('prefers JSON-LD Product data and resolves relative image URLs', () => {
    const html = `<html><head><title>Shop</title><meta property="og:title" content="OG title">
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Skull Tee","description":"Heavy cotton","image":["/img/tee.jpg"]}</script></head></html>`;
    expect(extractProductMeta(html, 'https://shop.example/p/1')).toEqual({ title: 'Skull Tee', description: 'Heavy cotton', imageUrl: 'https://shop.example/img/tee.jpg' });
  });
  it('handles @graph JSON-LD', () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":"Product","name":"Bar","image":{"url":"https://c.co/b.png"}}]}</script>`;
    expect(extractProductMeta(html, 'https://x.co').title).toBe('Bar');
  });
  it('falls back to OpenGraph', () => {
    const html = `<head><meta property="og:title" content="Choc Bar"><meta property="og:description" content="Tasty"><meta property="og:image" content="https://c.co/i.jpg"></head>`;
    expect(extractProductMeta(html, 'https://x.co')).toMatchObject({ title: 'Choc Bar', description: 'Tasty', imageUrl: 'https://c.co/i.jpg' });
  });
});

import { toIso } from '../src/collectors/metaAds.js';
describe('toIso (Meta startDate)', () => {
  it('handles epoch seconds as string or number, ISO strings, and garbage', () => {
    expect(toIso('1714719600')).toBe('2024-05-03T07:00:00.000Z');
    expect(toIso(1714719600)).toBe('2024-05-03T07:00:00.000Z');
    expect(toIso('2024-05-03T07:00:00Z')).toBe('2024-05-03T07:00:00.000Z');
    expect(toIso('not a date')).toBeUndefined();
    expect(toIso(undefined)).toBeUndefined();
  });
});
