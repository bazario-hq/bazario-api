export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://bazario:bazario@localhost:55432/bazario_test';
export const TEMPLATE_DB = 'bazario_template';
export const TEST_BUCKET = 'bazario-test';

export function databaseUrl(name: string) {
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  return url.toString();
}
