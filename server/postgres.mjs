import pg from "pg";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createStore } from "./store.mjs";

const columns = {
  records: ["kind", "id", "value"],
  users: ["id", "email", "name", "role", "customerId", "password", "access"],
  sessions: ["token", "userId", "expires"],
  audit: [
    "seq",
    "id",
    "userId",
    "time",
    "action",
    "kind",
    "recordId",
    "old",
    "new",
    "previous",
    "hash",
  ],
};
const keys = {
  records: ["kind", "id"],
  users: ["id"],
  sessions: ["token"],
  audit: ["seq"],
};
const quote = (name) => `"${name}"`;
const keyOf = (table, row) =>
  JSON.stringify(keys[table].map((key) => row[key]));
const digest = (row) =>
  createHash("sha256").update(JSON.stringify(row)).digest("hex");

export function createPool(env = process.env) {
  if (!env.DATABASE_URL) throw new Error("databaseNotConfigured");
  const url = new URL(env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("databaseNotConfigured");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  // Do not let connection-string sslmode silently override certificate validation.
  for (const k of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    url.searchParams.delete(k);
  return new pg.Pool({
    connectionString: url.toString(),
    max: 2,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
    allowExitOnIdle: true,
    ssl: local
      ? false
      : {
          rejectUnauthorized: true,
          ...(env.DATABASE_CA_CERT
            ? { ca: env.DATABASE_CA_CERT.replaceAll("\\n", "\n") }
            : {}),
        },
  });
}

export async function migrate(pool) {
  const sql = readFileSync(
    new URL("../supabase/migrations/001_doards.sql", import.meta.url),
    "utf8",
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Existing synchronous business rules run in an isolated, in-memory unit of work.
// PostgreSQL is the sole durable store. A database lock serializes mutations across
// all serverless instances; no response is sent until the PostgreSQL commit succeeds.
export async function unitOfWork(pool, operation, { write = true } = {}) {
  const client = await pool.connect();
  let s;
  try {
    await client.query(
      write ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    await client.query("SET LOCAL statement_timeout = '25000'");
    if (write) {
      await client.query("SET LOCAL lock_timeout = '15000'");
      await client.query("SELECT pg_advisory_xact_lock(73482619)");
    }
    s = createStore(":memory:");
    const before = {};
    for (const table of Object.keys(columns)) {
      const sql =
        table === "sessions"
          ? "SELECT * FROM doards.sessions WHERE expires > $1"
          : table === "audit"
            ? "SELECT * FROM (SELECT * FROM doards.audit ORDER BY seq DESC LIMIT 500) a ORDER BY seq"
            : `SELECT * FROM doards.${table}`;
      const result = await client.query(
        sql,
        table === "sessions" ? [Date.now()] : [],
      );
      const insert = s.db.prepare(
        `INSERT INTO ${table} (${columns[table].map(quote)}) VALUES (${columns[table].map(() => "?")})`,
      );
      before[table] = new Map();
      for (const raw of result.rows) {
        const row = { ...raw };
        if (table === "records") row.value = JSON.stringify(row.value);
        if (table === "sessions") row.expires = Number(row.expires);
        if (table === "audit") row.seq = Number(row.seq);
        insert.run(...columns[table].map((k) => row[k]));
        before[table].set(keyOf(table, row), digest(row));
      }
    }
    const result = await operation(s, client);
    if (write) {
      for (const table of Object.keys(columns)) {
        const after = s.db.prepare(`SELECT * FROM ${table}`).all();
        const seen = new Set();
        for (const row of after) {
          const key = keyOf(table, row);
          seen.add(key);
          if (before[table].get(key) === digest(row)) continue;
          if (table === "audit" && before[table].has(key))
            throw new Error("Audit mutation rejected");
          const cols = columns[table];
          const update =
            table === "audit"
              ? ""
              : ` ON CONFLICT (${keys[table].map(quote)}) DO UPDATE SET ${cols
                  .filter((k) => !keys[table].includes(k))
                  .map((k) => `${quote(k)}=EXCLUDED.${quote(k)}`)
                  .join(",")}`;
          await client.query(
            `INSERT INTO doards.${table} (${cols.map(quote)}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")})${update}`,
            cols.map((k) => row[k]),
          );
        }
        if (table === "sessions")
          for (const key of before[table].keys())
            if (!seen.has(key))
              await client.query(
                "DELETE FROM doards.sessions WHERE token=$1",
                JSON.parse(key),
              );
      }
      await client.query("DELETE FROM doards.sessions WHERE expires <= $1", [
        Date.now(),
      ]);
    }
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* Connection may already be closed. */
    }
    throw e;
  } finally {
    s?.db.close();
    client.release();
  }
}

export async function rateLimit(pool, key, max, windowMs = 60000) {
  const now = Date.now();
  const result = await pool.query(
    `INSERT INTO doards.rate_limits(key,count,expires) VALUES($1,1,$2)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN doards.rate_limits.expires <= $3 THEN 1 ELSE doards.rate_limits.count+1 END,
    expires=CASE WHEN doards.rate_limits.expires <= $3 THEN $2 ELSE doards.rate_limits.expires END RETURNING count`,
    [key, now + windowMs, now],
  );
  return result.rows[0].count <= max;
}
