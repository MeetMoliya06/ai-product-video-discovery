import { createServer } from 'node:http';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let server: ReturnType<typeof createServer>;
let calls: any[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const j = JSON.parse(body);
      calls.push(j);
      const n = j.messages[1].images.length - 1; // first image is the reference
      // thumbnail 1 = same product, 2 = different, 3 omitted by the model, rest ignored
      const results = [{ i: 1, score: 92, sameProduct: true, reason: 'same skull print' }, { i: 2, score: 30, sameProduct: false, reason: 'different product' }].slice(0, n);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ message: { content: '```json\n' + JSON.stringify({ results }) + '\n```' } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.OLLAMA_URL = `http://127.0.0.1:${(server.address() as any).port}`;
  process.env.VISION_PROVIDER = 'ollama';
  process.env.VISION_RPM = '6000';
});
afterAll(() => server.close());

describe('batch scoring via a vision provider', () => {
  it('sends one call for the whole batch and maps results back by index, falling back for omitted entries', async () => {
    const { scoreVideos } = await import('../src/brain/scoreVideo.js');
    const { heuristicAnalysis } = await import('../src/brain/analyzeProduct.js');
    const img = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#888' } }).jpeg().toBuffer();
    const product = { title: 'Skull tee', description: '', imageBase64: img.toString('base64') };
    const analysis = heuristicAnalysis(product);
    const scores = await scoreVideos(product, analysis, [
      { caption: 'skull tee haul', thumbnail: img },
      { caption: 'weekend vlog', thumbnail: img },
      { caption: 'no model verdict for this one', thumbnail: img },
      { caption: 'no thumbnail', thumbnail: undefined },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].messages[1].images).toHaveLength(4); // reference + 3 thumbnails (the 4th video has none)
    expect(scores[0]).toMatchObject({ engine: 'vision', sameProduct: true, reason: 'same skull print' });
    expect(scores[0].score).toBeGreaterThanOrEqual(83);
    expect(scores[1].score).toBeLessThanOrEqual(59); // different product can never reach match territory
    expect(scores[2].engine).toBe('heuristic'); // omitted by the model
    expect(scores[3].engine).toBe('heuristic'); // no thumbnail
  });
});
