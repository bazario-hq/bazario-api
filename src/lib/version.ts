import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json');

export const version: string = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
