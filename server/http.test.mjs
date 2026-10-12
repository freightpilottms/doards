import test from "node:test";
import assert from "node:assert/strict";
import { createApp, demoAddressAllowed } from "./index.mjs";

test("LAN demo access is opt-in and restricted to the configured subnet", () => {
  assert.equal(demoAddressAllowed("127.0.0.1"), true);
  assert.equal(demoAddressAllowed("192.168.1.42"), false);
  assert.equal(demoAddressAllowed("192.168.1.42", "192.168.1.0"), true);
  assert.equal(demoAddressAllowed("::ffff:192.168.1.42", "192.168.1.0"), true);
  assert.equal(demoAddressAllowed("192.168.2.42", "192.168.1.0"), false);
  assert.equal(demoAddressAllowed("8.8.8.8", "192.168.1.0"), false);
  assert.equal(demoAddressAllowed("2001:db8::1", "192.168.1.0"), false);
});

test("HTTP authentication, private media, user-level rights and account revocation", async () => {
  const app = await createApp({ dbPath: ":memory:", demo: true });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const request = async (path, body, cookie) =>
    fetch(base + "/api/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const login = async (role) =>
    (await request("demo", { role })).headers.get("set-cookie").split(";")[0];
  try {
    assert.equal((await request("state")).status, 401);
    const admin = await login("admin"),
      driver = await login("driver"),
      employee = await login("employee");
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
    let res = await request(
      "action",
      {
        action: "vehicle.photo",
        payload: { id: "V-001", angle: "front", photo: png },
      },
      admin,
    );
    assert.equal(res.status, 200);
    const data = (await res.json()).state,
      photoUrl = data.vehicles.find((v) => v.id === "V-001").photos.front;
    assert(photoUrl.startsWith("/api/media/"));
    assert.equal(
      (await fetch(base + photoUrl, { headers: { Cookie: admin } })).status,
      200,
    );
    assert.equal(
      (await fetch(base + photoUrl, { headers: { Cookie: driver } })).status,
      403,
    );
    assert.equal((await fetch(base + photoUrl)).status, 401);
    assert.equal(
      (await request("assistant", { question: "vehicles" })).status,
      401,
    );
    const assistant = await request(
      "assistant",
      { question: "unpaid invoices", lang: "en" },
      driver,
    );
    assert.equal(assistant.status, 200);
    assert.match((await assistant.json()).answer, /unavailable for this role/);
    assert.equal(
      (await request("automation", { enabled: true }, driver)).status,
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
          driver,
        )
      ).status,
      403,
    );
    res = await request(
      "action",
      {
        action: "user.update",
        payload: {
          id: "demo-employee",
          name: "Restricted employee",
          role: "employee",
          access: { vehicles: { edit: false } },
        },
      },
      admin,
    );
    assert.equal(res.status, 200);
    assert.equal((await request("state", undefined, employee)).status, 401);
    const restricted = await login("employee");
    assert.equal(
      (
        await request(
          "action",
          {
            action: "vehicle.status",
            payload: { id: "V-001", status: "blocked" },
          },
          restricted,
        )
      ).status,
      403,
    );
    res = await request("state", undefined, restricted);
    const safe = await res.json();
    assert(safe.permissions.includes("vehicles"));
    assert(!safe.permissions.includes("vehicles:edit"));
    assert.equal(safe.vehicles[0].purchasePrice, undefined);
    const originRes = await fetch(base + "/api/action", {
      method: "POST",
      headers: {
        Cookie: admin,
        "Content-Type": "application/json",
        Origin: "https://unrelated.example",
      },
      body: JSON.stringify({
        action: "vehicle.status",
        payload: { id: "V-001", status: "blocked" },
      }),
    });
    assert.equal(originRes.status, 403);
    assert.equal((await request("telemetry", { trackerId: "x" })).status, 401);
  } finally {
    await app.close();
  }
});
