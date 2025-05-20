import { once } from 'node:events';
import type pg from 'pg';
import { from as copyFrom } from 'pg-copy-streams';

type Cell = string | number | boolean | Date | null | undefined | object;

function encode(value: Cell): string {
  if (value === null || value === undefined) return '\\N';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 't' : 'f';
  const s = value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : value;
  return s.replace(/[\\\t\n\r]/g, (ch) => (ch === '\\' ? '\\\\' : ch === '\t' ? '\\t' : ch === '\n' ? '\\n' : '\\r'));
}

/** Streams rows into a table with COPY ... FROM STDIN (text format). */
export class CopyWriter {
  private buffer: string[] = [];
  private size = 0;
  rows = 0;

  private constructor(private readonly stream: NodeJS.WritableStream) {}

  static async open(client: pg.PoolClient | pg.Client, table: string, columns: string[]) {
    const stream = client.query(copyFrom(`COPY ${table} (${columns.join(', ')}) FROM STDIN`));
    return new CopyWriter(stream);
  }

  async write(row: Cell[]) {
    const line = row.map(encode).join('\t') + '\n';
    this.buffer.push(line);
    this.size += line.length;
    this.rows++;
    if (this.size > 1 << 20) await this.flush();
  }

  private async flush() {
    if (this.buffer.length === 0) return;
    const chunk = this.buffer.join('');
    this.buffer = [];
    this.size = 0;
    if (!this.stream.write(chunk)) await once(this.stream, 'drain');
  }

  async close() {
    await this.flush();
    const done = Promise.race([once(this.stream, 'finish'), once(this.stream, 'error').then(([err]) => Promise.reject(err))]);
    this.stream.end();
    await done;
    return this.rows;
  }
}
