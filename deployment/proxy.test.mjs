import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../server/index.mjs";
import { backendOrigin, proxyRequest } from "./proxy.mjs";

test("proxy fails closed for absent/invalid configuration and cross-origin requests", async () => {
  for (const origin of ["", "http://backend.example.com", "https://user:pass@example.com", "https://api.example.com/api", "https://api.example.com?secret=x"])
    assert.throws(() => backendOrigin(origin));
  assert.equal(backendOrigin("https://api.example.com/"), "https://api.example.com");
  const missing = await proxyRequest(new Request("https://app.example.com/api/session"), { origin: "" });
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).error, "backendNotConfigured");
  const csrf = await proxyRequest(new Request("https://app.example.com/api/action", {
    method: "POST", headers: { Origin: "https://attacker.example.com" }, body: "{}",
  }), { origin: "https://api.example.com" });
  assert.equal(csrf.status, 403);
  const loop = await proxyRequest(new Request("https://app.example.com/api/session"), { origin: "https://app.example.com" });
  assert.equal(loop.status, 503);
});

test("proxy preserves auth, role isolation, private files, state writes, errors and logout", async () => {
  const app = await createApp({ dbPath: ":memory:", demo: true });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const cookies = new Map();
  const call = async (path, surface = "board", body) => {
    const response = await proxyRequest(new Request("https://app.example.com" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { Origin: "https://app.example.com", "X-DOARDS-App": surface,
        "Content-Type": "application/json", Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), { origin });
    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(";")[0], i = pair.indexOf("=");
      cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return response;
  };
  try {
    assert.equal((await call("/api/state")).status, 401);
    const login = await call("/api/demo", "board", { role: "admin" });
    assert.equal(login.status, 200);
    assert.equal(login.headers.getSetCookie().length, 2);
    assert.match(login.headers.get("cache-control"), /no-store/);
    assert.equal((await call("/api/demo", "clients", { role: "client" })).status, 200);
    const client = await (await call("/api/state", "clients")).json();
    assert.equal(client.vehicles.length, 3);
    const document = client.documents.find((d) => d.vehicleId === "DEMO-CLIENT-V1");
    const file = await call(document.file, "clients");
    assert.equal(file.headers.get("content-type"), "application/pdf");
    assert.match(await file.text(), /^%PDF-/);
    assert.equal((await call("/api/demo", "clients", { role: "driver" })).status, 200);
    assert.equal((await call(document.file, "clients")).status, 403);
    const driver = await (await call("/api/state", "clients")).json();
    assert.deepEqual(driver.vehicles.map((v) => v.id), ["V-002"]);
    const result = await call("/api/action", "clients", {
      action: "message.send", payload: { vehicleId: "V-002", channel: "clients", body: "Deployment proxy test", attachments: [] },
    });
    assert.equal(result.status, 200, await result.text());
    const board = await (await call("/api/state")).json();
    assert.equal(board.user.id, "demo-admin");
    assert(board.messages.some((m) => m.body === "Deployment proxy test"));
    assert.equal((await call("/api/events?app=clients", "clients")).status, 204);
    assert.equal((await call("/api/logout", "clients", {})).status, 200);
    assert.equal((await call("/api/state", "clients")).status, 401);
    assert.equal((await call("/api/state")).status, 200);
    const big = await call("/api/action", "board", { body: "x".repeat(4_000_001) });
    assert.equal(big.status, 413);
    assert.equal((await big.json()).error, "fileTooLarge");
  } finally { await app.close(); }
});

test("upstream timeouts and redirects do not forward credentials to a new host", async () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/api/redirect") { res.writeHead(302, { Location: "https://other.example.com" }); res.end(); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ["timeout", "redirect"]) {
      const response = await proxyRequest(new Request(`https://app.example.com/api/${path}`), { origin, timeoutMs: 100 });
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error, "backendUnavailable");
    }
  } finally { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
});
