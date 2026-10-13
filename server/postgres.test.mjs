import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import http from "node:http";
import { migrate, unitOfWork, rateLimit } from "./postgres.mjs";
import { provision } from "./migrate-supabase.mjs";
import { createCloudHandler } from "./cloud-server.mjs";
import { execute, verifyPassword } from "./domain.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { createApp } from "./index.mjs";
import { createStore } from "./store.mjs";

async function database() {
  const db = new PGlite();
  const query = async (sql, params) => {
    if (!params?.length && sql.includes("CREATE SCHEMA"))
      return (await db.exec(sql)).at(-1);
    return db.query(sql, params);
  };
  // PGlite has one connection; serialize clients just as the production advisory lock does.
  let tail = Promise.resolve();
  const pool = {
    query,
    connect: async () => {
      const before = tail;
      let release;
      tail = new Promise((r) => (release = r));
      await before;
      return { query, release };
    },
    end: () => db.close(),
  };
  await migrate(pool);
  return pool;
}
const env = {
  DOARDS_ADMIN_EMAIL: "owner@example.com",
  DOARDS_ADMIN_PASSWORD: "Test-owner-password-123",
  DOARDS_DEMO_PASSWORD: "Test-demo-password-456",
  DOARDS_PRESENTATION: "1",
  CRON_SECRET: "cron-test-secret",
};

test("Supabase schema, atomic domain changes, immutable audit, persisted sessions and guarded provisioning", async () => {
  const pool = await database();
  try {
    const counts = await provision(pool, { demo: true, env });
    assert(counts.find((r) => r.kind === "vehicles").count >= 20);
    await assert.rejects(
      () => provision(pool, { demo: true, env }),
      /not empty/,
    );
    await unitOfWork(pool, (s) => {
      assert(
        verifyPassword(
          env.DOARDS_ADMIN_PASSWORD,
          s.db
            .prepare("SELECT password FROM users WHERE id=?")
            .get("cloud-owner").password,
        ),
      );
      execute(s, { id: "cloud-owner", role: "admin" }, "vehicle.status", {
        id: "V-001",
        status: "blocked",
      });
    });
    await unitOfWork(
      pool,
      (s) => assert.equal(s.get("vehicles", "V-001").status, "blocked"),
      { write: false },
    );
    await assert.rejects(
      () =>
        unitOfWork(pool, (s) => {
          s.put("vehicles", { id: "ROLLBACK" });
          throw new Error("rollback-test");
        }),
      /rollback-test/,
    );
    await unitOfWork(
      pool,
      (s) => assert.equal(s.get("vehicles", "ROLLBACK"), undefined),
      { write: false },
    );
    await assert.rejects(
      () => pool.query("UPDATE doards.audit SET action='tamper'"),
      /Append-only/,
    );
    assert.equal(await rateLimit(pool, "limit", 1), true);
    assert.equal(await rateLimit(pool, "limit", 1), false);
    const rls = await pool.query(
      "SELECT relrowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='doards' AND relname='records'",
    );
    assert.equal(rls.rows[0].relrowsecurity, true);
  } finally {
    await pool.end();
  }
});

test("cloud HTTP login, role isolation, commit-before-response, cron authentication and no public setup/demo", async () => {
  const pool = await database();
  await provision(pool, { demo: true, env });
  const server = http.createServer(createCloudHandler({ pool, env }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path, body, cookie) =>
    fetch(origin + "/api/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    assert.equal(
      (await request("setup", { email: "intruder@example.com" })).status,
      403,
    );
    assert.equal((await request("demo", { role: "admin" })).status, 403);
    assert.equal((await (await request("session")).json()).demo, false);
    const login = await request("login", {
      email: "admin@doards.local",
      password: env.DOARDS_DEMO_PASSWORD,
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    assert(
      (await (await request("state", undefined, cookie)).json()).vehicles
        .length >= 20,
    );
    const driverLogin = await request("login", {
      email: "driver@doards.local",
      password: env.DOARDS_DEMO_PASSWORD,
    });
    const driver = driverLogin.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (await (await request("state", undefined, driver)).json()).vehicles
        .length,
      1,
    );
    assert.equal(
      (
        await request(
          "action",
          {
            action: "vehicle.status",
            payload: { id: "V-001", status: "blocked" },
          },
          driver,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          "action",
          {
            action: "vehicle.status",
            payload: { id: "V-001", status: "blocked" },
          },
          cookie,
        )
      ).status,
      200,
    );
    const freshHandler = http.createServer(createCloudHandler({ pool, env }));
    await new Promise((r) => freshHandler.listen(0, "127.0.0.1", r));
    try {
      const res = await fetch(
        `http://127.0.0.1:${freshHandler.address().port}/api/state`,
        { headers: { Cookie: cookie } },
      );
      assert.equal(
        (await res.json()).vehicles.find((v) => v.id === "V-001").status,
        "blocked",
      );
    } finally {
      await new Promise((r) => freshHandler.close(r));
    }
    assert.equal((await request("cron")).status, 401);
    assert.equal(
      (
        await fetch(origin + "/api/cron", {
          headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(origin + "/api/login", {
          method: "POST",
          headers: {
            Origin: "https://evil.example",
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
      403,
    );
    await request("logout", {}, cookie);
    assert.equal((await request("state", undefined, cookie)).status, 401);
  } finally {
    await new Promise((r) => server.close(r));
    await pool.end();
  }
});

test("existing SQLite data and audit migrate without sessions or overwriting the source", async () => {
  const dir = mkdtempSync(join(tmpdir(), "doards-import-")),
    path = join(dir, "source.sqlite");
  const pool = await database();
  try {
    const app = await createApp({ dbPath: path, demo: true, scheduler: false });
    execute(app.store, { id: "demo-admin", role: "admin" }, "vehicle.status", {
      id: "V-001",
      status: "blocked",
    });
    app.store.db
      .prepare("INSERT INTO sessions(token,userId,expires) VALUES(?,?,?)")
      .run("private-local-token", "demo-admin", Date.now() + 60000);
    const originalHash = app.store.db
      .prepare("SELECT hash FROM audit ORDER BY seq DESC LIMIT 1")
      .get().hash;
    await app.close();
    await provision(pool, { sourcePath: path, enrich: true, env });
    await unitOfWork(
      pool,
      (s) => {
        assert.equal(s.get("vehicles", "V-001").status, "blocked");
        assert.equal(
          s.db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n,
          0,
        );
        assert.equal(
          s.db.prepare("SELECT hash FROM audit ORDER BY seq DESC LIMIT 1").get()
            .hash,
          originalHash,
        );
        assert.equal(s.get("meta", "presentation-only"), undefined);
      },
      { write: false },
    );
    const source = createStore(path);
    assert.equal(
      source.db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n,
      1,
    );
    assert.equal(
      source.db.prepare("SELECT id FROM users WHERE id='cloud-owner'").get(),
      undefined,
    );
    source.db.close();
    await Promise.all(
      Array.from({ length: 4 }, () =>
        unitOfWork(pool, (s) => {
          const old = s.get("meta", "counter") || { id: "counter", value: 0 };
          s.put("meta", { ...old, value: old.value + 1 });
        }),
      ),
    );
    await unitOfWork(
      pool,
      (s) => assert.equal(s.get("meta", "counter").value, 4),
      { write: false },
    );
  } finally {
    await pool.end();
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert(basename(dir).startsWith("doards-import-"));
    rmSync(dir, { recursive: true, force: true });
  }
});
