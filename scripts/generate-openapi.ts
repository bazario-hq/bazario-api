import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/routes.js';
import { generateOpenApiDocument } from '../src/openapi/registry.js';
import { version } from '../src/lib/version.js';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../openapi.json');
const doc = generateOpenApiDocument(version);
writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
console.log(`wrote ${path.relative(process.cwd(), out)} (${Object.keys(doc.paths ?? {}).length} paths)`);
