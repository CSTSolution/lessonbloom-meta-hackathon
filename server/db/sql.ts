// One small interface over Postgres, so the server runs on the real database (the CST server's
// shared Postgres 16) and the tests run on PGlite, a real Postgres compiled to WebAssembly that
// lives in the test process. Same SQL, same migrations, no mocks of the database.
import pg from 'pg';

export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T | undefined>;
  tx<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// node-postgres. The CST database uses a self-signed certificate: encrypted, CA not checked.
export function pgSql(url: string): Sql {
  const pool = new pg.Pool({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''), ssl: /sslmode=(require|no-verify)/.test(url) ? { rejectUnauthorized: false } : undefined, max: 8 });
  const over = (c: { query: pg.Pool['query'] }): Sql => ({
    async query(text, params = []) { return (await c.query(text, params)).rows; },
    async one(text, params = []) { return (await c.query(text, params)).rows[0]; },
    tx: () => { throw new Error('nested transaction'); },
    close: async () => {},
  });
  return {
    ...over(pool),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const out = await fn(over(client));
        await client.query('commit');
        return out;
      } catch (e) { await client.query('rollback').catch(() => {}); throw e; } finally { client.release(); }
    },
    close: () => pool.end(),
  };
}

// PGlite: in memory (tests) or in a folder (local development without a database server).
export async function pgliteSql(dir?: string): Promise<Sql> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
  const { unaccent } = await import('@electric-sql/pglite/contrib/unaccent');
  const db = new PGlite({ ...(dir ? { dataDir: dir } : {}), extensions: { pg_trgm, unaccent } });   // the same extensions as the server's Postgres
  const over = (c: { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }): Sql => ({
    async query<T>(text: string, params: unknown[] = []) { return (await c.query(text, params)).rows as T[]; },
    async one<T>(text: string, params: unknown[] = []) { return (await c.query(text, params)).rows[0] as T | undefined; },
    tx: () => { throw new Error('nested transaction'); },
    close: async () => {},
  });
  return { ...over(db), tx: (fn) => db.transaction((t) => fn(over(t))), close: () => db.close() };
}
