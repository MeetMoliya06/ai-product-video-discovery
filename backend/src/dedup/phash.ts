import sharp from 'sharp';

/** 64-bit difference hash as 16 hex chars. Robust to rescaling/recompression; cheap to compare. */
export async function dHash(image: Buffer): Promise<string> {
  const { data } = await sharp(image).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits = (bits << 1n) | (data[y * 9 + x] > data[y * 9 + x + 1] ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, '0');
}

export function hamming(a: string, b: string): number {
  let x = BigInt('0x' + a) ^ BigInt('0x' + b);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

const popcount = (h: string) => hamming(h, '0000000000000000');

/**
 * A dHash of a near-uniform image (black first frame, blank card) is almost all 0s or 1s, so every such
 * thumbnail looks "identical". Hashes with too little structure are not evidence of duplication.
 */
export function isInformativeHash(h: string | undefined): h is string {
  if (!h) return false;
  const bits = popcount(h);
  return bits >= 12 && bits <= 52;
}
