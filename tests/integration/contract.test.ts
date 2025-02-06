import { readFileSync } from 'node:fs';
import SwaggerParser from '@apidevtools/swagger-parser';
import { describe, expect, it } from 'vitest';
import { generateOpenApiDocument } from '../../src/openapi/registry.js';
import { version } from '../../src/lib/version.js';
import '../support/app.js';

describe('OpenAPI contract', () => {
  it('matches the committed openapi.json (run `npm run openapi` after changing routes)', () => {
    const committed = JSON.parse(readFileSync(new URL('../../openapi.json', import.meta.url), 'utf8'));
    const generated = JSON.parse(JSON.stringify(generateOpenApiDocument(version)));
    expect(generated).toEqual(committed);
  });

  it('documents every route with a summary and tags', () => {
    const doc = generateOpenApiDocument(version);
    for (const [path, item] of Object.entries(doc.paths ?? {})) {
      for (const [method, op] of Object.entries(item as Record<string, { summary?: string; tags?: string[] }>)) {
        expect(op.summary, `${method.toUpperCase()} ${path}`).toBeTruthy();
        expect(op.tags?.length, `${method.toUpperCase()} ${path}`).toBeGreaterThan(0);
      }
    }
  });

  it('is a valid OpenAPI 3 document', async () => {
    const doc = JSON.parse(JSON.stringify(generateOpenApiDocument(version)));
    await expect(SwaggerParser.validate(doc)).resolves.toBeTruthy();
  });
});
