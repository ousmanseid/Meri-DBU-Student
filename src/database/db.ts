import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { env } from '../config/env.js';
import fs from 'fs';
import path from 'path';

export interface DatabaseClient {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }>;
  transaction<T>(fn: (client: DatabaseClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

class PGliteAdapter implements DatabaseClient {
  private pglite: PGlite;

  constructor(pglite: PGlite) {
    this.pglite = pglite;
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number }> {
    const res = await this.pglite.query<T>(sql, params);
    return {
      rows: res.rows,
      rowCount: res.affectedRows ?? res.rows.length,
    };
  }

  async transaction<T>(fn: (client: DatabaseClient) => Promise<T>): Promise<T> {
    await this.pglite.exec('BEGIN;');
    try {
      const result = await fn(this);
      await this.pglite.exec('COMMIT;');
      return result;
    } catch (err) {
      await this.pglite.exec('ROLLBACK;');
      throw err;
    }
  }

  async close(): Promise<void> {
    await this.pglite.close();
  }
}

class PostgresAdapter implements DatabaseClient {
  private pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number }> {
    const res = await this.pool.query(sql, params);
    return {
      rows: res.rows as T[],
      rowCount: res.rowCount ?? 0,
    };
  }

  async transaction<T>(fn: (client: DatabaseClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const txAdapter: DatabaseClient = {
        async query<R = any>(sql: string, params: any[] = []): Promise<{ rows: R[]; rowCount: number }> {
          const res = await client.query(sql, params);
          return { rows: res.rows as R[], rowCount: res.rowCount ?? 0 };
        },
        async transaction<R>(nestedFn: (c: DatabaseClient) => Promise<R>): Promise<R> {
          return nestedFn(this);
        },
        async close(): Promise<void> {
          // No-op inside transaction client
        },
      };
      const result = await fn(txAdapter);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

let activeDb: DatabaseClient | null = null;

export async function getDb(): Promise<DatabaseClient> {
  if (activeDb) {
    return activeDb;
  }

  if (env.USE_PGLITE === 'true' || !env.DATABASE_URL) {
    const dir = env.PGLITE_DATA_DIR;
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const pglite = new PGlite(dir);
    activeDb = new PGliteAdapter(pglite);
  } else {
    const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
    activeDb = new PostgresAdapter(pool);
  }

  return activeDb;
}

export async function createIsolatedTestDb(): Promise<DatabaseClient> {
  // In-memory isolated DB for specific isolated test suites
  const pglite = new PGlite();
  return new PGliteAdapter(pglite);
}
