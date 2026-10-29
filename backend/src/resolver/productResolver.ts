import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { safeFetch } from '../net/ssrfGuard.js';
import type { Product } from '../types.js';

/** Normalize any image to a bounded JPEG so downstream models get a predictable input. */
export async function normalizeImage(buf: Buffer): Promise<{ base64: string; hash: string }> {
  const jpeg = await sharp(buf).rotate().resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#fff' }).jpeg({ quality: 82 }).toBuffer();
  return { base64: jpeg.toString('base64'), hash: createHash('sha1').update(jpeg).digest('hex') };
}

export async function productFromImageBuffer(buf: Buffer, title = ''): Promise<Product> {
  const { base64, hash } = await normalizeImage(buf);
  return { title, description: '', imageBase64: base64, imageHash: hash };
}

interface Extracted {
  title: string;
  description: string;
  imageUrl?: string;
}

/** Pull product info from JSON-LD first (most reliable on Shopify/brand sites), then OpenGraph, then plain HTML. */
export function extractProductMeta(html: string, baseUrl: string): Extracted {
  const $ = cheerio.load(html);
  let title = '';
  let description = '';
  let image: string | undefined;

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).contents().text());
      const nodes: any[] = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];
      for (const n of nodes) {
        const type = [].concat(n?.['@type'] ?? []).join(',');
        if (/Product/i.test(type)) {
          title ||= n.name ?? '';
          description ||= n.description ?? '';
          const img = Array.isArray(n.image) ? n.image[0] : n.image;
          image ||= typeof img === 'string' ? img : img?.url;
        }
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  });

  const meta = (sel: string) => $(sel).attr('content')?.trim() ?? '';
  title ||= meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]') || $('h1').first().text().trim() || $('title').first().text().trim();
  description ||= meta('meta[property="og:description"]') || meta('meta[name="description"]');
  image ||= meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]') || $('img#landingImage').attr('src') || undefined;

  let imageUrl: string | undefined;
  if (image) {
    try {
      imageUrl = new URL(image, baseUrl).toString();
    } catch {
      /* ignore */
    }
  }
  return { title: title.replace(/\s+/g, ' ').slice(0, 300), description: description.replace(/\s+/g, ' ').slice(0, 1500), imageUrl };
}

export async function resolveProductUrl(url: string): Promise<Product> {
  const page = await safeFetch(url, { maxBytes: 2_500_000, headers: { accept: 'text/html,application/xhtml+xml' } });
  const meta = extractProductMeta(page.body.toString('utf8'), page.finalUrl);
  if (!meta.title) throw new Error('Could not find a product title on that page. Try a keyword or upload the product photo instead.');

  const product: Product = { title: meta.title, description: meta.description, sourceUrl: page.finalUrl, imageUrl: meta.imageUrl };
  if (meta.imageUrl) {
    try {
      const img = await safeFetch(meta.imageUrl, { maxBytes: 8_000_000 });
      const norm = await normalizeImage(img.body);
      product.imageBase64 = norm.base64;
      product.imageHash = norm.hash;
    } catch {
      /* continue text-only; the brain will say so */
    }
  }
  return product;
}
