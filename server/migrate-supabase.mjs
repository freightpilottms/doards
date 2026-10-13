import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createStore } from "./store.mjs";
import { createApp } from "./index.mjs";
import { hashPassword } from "./domain.mjs";
import { enrichDemo } from "./demo.mjs";
import { createPool, migrate, unitOfWork } from "./postgres.mjs";

export function copyLocalDatabase(path, target) {
  if (!existsSync(path)) throw new Error("Local database does not exist");
  const source = new DatabaseSync(resolve(path), { readOnly: true });
  try {
    source.exec("BEGIN");
    for (const table of ["records", "users", "audit"]) {
      const rows = source.prepare(`SELECT * FROM ${table}`).all();
      for (const row of rows) {
        const cols = Object.keys(row);
        target.db
          .prepare(
            `INSERT INTO ${table} (${cols.map((k) => `"${k}"`)}) VALUES (${cols.map(() => "?")})`,
          )
          .run(...cols.map((k) => row[k]));
      }
    }
    source.exec("COMMIT");
  } finally {
    source.close();
  }
  // Sessions are intentionally never copied to the cloud.
}

export function setAdmin(s, env) {
  const email = String(env.DOARDS_ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  const password = env.DOARDS_ADMIN_PASSWORD || "";
  if (!email.includes("@") || password.length < 16)
    throw new Error(
      "Set DOARDS_ADMIN_EMAIL and a DOARDS_ADMIN_PASSWORD of at least 16 characters in .env.supabase",
    );
  const existing = s.db
    .prepare("SELECT id FROM users WHERE email=?")
    .get(email);
  if (existing)
    s.db
      .prepare("UPDATE users SET password=?,role=?,access=? WHERE id=?")
      .run(hashPassword(password), "admin", "{}", existing.id);
  else
    s.db
      .prepare(
        "INSERT INTO users(id,email,name,role,customerId,password,access) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        "cloud-owner",
        email,
        "DOARDS Administrator",
        "admin",
        "",
        hashPassword(password),
        "{}",
      );
}

export async function provision(
  pool,
  { sourcePath, demo = false, enrich = false, env = process.env } = {},
) {
  const staged = createStore(":memory:");
  try {
    if (demo) {
      if ((env.DOARDS_DEMO_PASSWORD || "").length < 16)
        throw new Error(
          "Set DOARDS_DEMO_PASSWORD (at least 16 characters) for presentation accounts",
        );
      await createApp({ store: staged, demo: true, scheduler: false });
      staged.put("meta", {
        id: "presentation-only",
        createdAt: new Date().toISOString(),
      });
      for (const u of staged.db.prepare("SELECT id FROM users").all())
        staged.db
          .prepare("UPDATE users SET password=? WHERE id=?")
          .run(hashPassword(env.DOARDS_DEMO_PASSWORD), u.id);
    } else if (sourcePath) copyLocalDatabase(sourcePath, staged);
    else throw new Error("Choose --demo or --import PATH");
    if (enrich) enrichDemo(staged);
    setAdmin(staged, env);
    return await unitOfWork(pool, (target) => {
      if (
        target.db.prepare("SELECT COUNT(*) AS n FROM records").get().n ||
        target.db.prepare("SELECT COUNT(*) AS n FROM users").get().n
      )
        throw new Error(
          "Target is not empty. Refusing to replace or merge existing Supabase data.",
        );
      for (const table of ["records", "users", "audit"])
        for (const row of staged.db.prepare(`SELECT * FROM ${table}`).all()) {
          const cols = Object.keys(row);
          target.db
            .prepare(
              `INSERT INTO ${table} (${cols.map((k) => `"${k}"`)}) VALUES (${cols.map(() => "?")})`,
            )
            .run(...cols.map((k) => row[k]));
        }
      target.put("meta", {
        id: "supabase-import",
        source: demo ? "fictional-presentation" : "local-import",
        at: new Date().toISOString(),
      });
      return target.db
        .prepare(
          "SELECT kind,COUNT(*) AS count FROM records GROUP BY kind ORDER BY kind",
        )
        .all();
    });
  } finally {
    staged.db.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2),
    idx = args.indexOf("--import"),
    sourcePath = idx < 0 ? undefined : args[idx + 1];
  if (!args.includes("--apply")) {
    console.log(
      "No cloud changes. Use --demo --apply for a new fictional database, or --import data/demo.sqlite --enrich --apply to transfer existing data. The destination must be empty; local data and sessions are not modified.",
    );
  } else {
    let pool;
    try {
      pool = createPool();
      await migrate(pool);
      const counts = await provision(pool, {
        sourcePath,
        demo: args.includes("--demo"),
        enrich: args.includes("--enrich"),
      });
      console.log(
        "Supabase import committed. Existing local database was not changed; sessions were not transferred.",
      );
      console.table(counts);
    } catch (e) {
      // Connection error messages may contain credentials; show only vetted local errors.
      const safe = /^(Set |Choose |Target |Local )/.test(e.message);
      console.error(
        safe
          ? e.message
          : `Migration failed (${e.code || e.name}). Check the connection, TLS certificate and schema permissions. No credentials are printed.`,
      );
      process.exitCode = 1;
    } finally {
      await pool?.end();
    }
  }
}
