import type { PoolClient } from "pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar";

export const pool = new Pool({ connectionString });

export async function query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }> {
  const res = await pool.query(text, params);
  return { rows: res.rows as T[], rowCount: res.rowCount };
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
