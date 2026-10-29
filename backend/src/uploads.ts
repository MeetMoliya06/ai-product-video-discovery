import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from './config.js';

const dir = join(dirname(config.DB_PATH), 'uploads');
mkdirSync(dir, { recursive: true });

export const saveUpload = (id: string, buf: Buffer) => writeFileSync(join(dir, id), buf);
export const readUpload = (id: string): Buffer | undefined => (existsSync(join(dir, id)) ? readFileSync(join(dir, id)) : undefined);
export const deleteUpload = (id: string) => rmSync(join(dir, id), { force: true });
