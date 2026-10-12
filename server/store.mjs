import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";

export function createStore(path = ":memory:") {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,id));
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, customerId TEXT, password TEXT NOT NULL, access TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, userId TEXT NOT NULL, time TEXT NOT NULL, action TEXT NOT NULL, kind TEXT NOT NULL, recordId TEXT NOT NULL, old TEXT, new TEXT, previous TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'Append-only audit'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'Append-only audit'); END;`);
  if (
    !db
      .prepare("PRAGMA table_info(users)")
      .all()
      .some((c) => c.name === "access")
  )
    db.exec("ALTER TABLE users ADD COLUMN access TEXT NOT NULL DEFAULT '{}'");
  const all = (kind) =>
    db
      .prepare("SELECT value FROM records WHERE kind=?")
      .all(kind)
      .map((r) => JSON.parse(r.value));
  const get = (kind, id) => {
    const r = db
      .prepare("SELECT value FROM records WHERE kind=? AND id=?")
      .get(kind, id);
    return r ? JSON.parse(r.value) : undefined;
  };
  const put = (kind, value) =>
    db
      .prepare(
        "INSERT INTO records(kind,id,value) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value",
      )
      .run(kind, value.id, JSON.stringify(value));
  const audit = (userId, action, kind, id, oldValue, newValue) => {
    const previous =
      db.prepare("SELECT hash FROM audit ORDER BY seq DESC LIMIT 1").get()
        ?.hash || "";
    const entry = {
      id: randomUUID(),
      userId,
      time: new Date().toISOString(),
      action,
      kind,
      recordId: id,
      old: oldValue ?? null,
      new: newValue ?? null,
      previous,
    };
    const hash = createHash("sha256")
      .update(JSON.stringify(entry))
      .digest("hex");
    db.prepare(
      "INSERT INTO audit(id,userId,time,action,kind,recordId,old,new,previous,hash) VALUES(?,?,?,?,?,?,?,?,?,?)",
    ).run(
      entry.id,
      userId,
      entry.time,
      action,
      kind,
      id,
      JSON.stringify(entry.old),
      JSON.stringify(entry.new),
      previous,
      hash,
    );
  };
  const save = (user, kind, value, action = "save") => {
    const old = get(kind, value.id);
    put(kind, value);
    audit(user.id, action, kind, value.id, old, value);
    return value;
  };
  const transaction = (fn) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  return { db, all, get, put, audit, save, transaction };
}
