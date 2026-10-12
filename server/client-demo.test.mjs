import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./index.mjs";
import { enrichDemo } from "./demo.mjs";

test("client presentation demo is additive and preserves driver scope and independent board sessions", async () => {
  const app = await createApp({ dbPath: ":memory:", demo: true });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const cookies = new Map();
  const request = async (path, surface, body) => {
    const response = await fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "X-DOARDS-App": surface,
        "Content-Type": "application/json",
        Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const raw of response.headers.getSetCookie()) {
      const cookie = raw.split(";")[0],
        index = cookie.indexOf("=");
      cookies.set(cookie.slice(0, index), cookie.slice(index + 1));
    }
    return response;
  };
  try {
    const vehicle = app.store.get("vehicles", "DEMO-CLIENT-V1");
    const count = app.store.all("vehicles").length;
    app.store.put("vehicles", { ...vehicle, mileage: 30000 });
    enrichDemo(app.store);
    assert.equal(app.store.all("vehicles").length, count);
    assert.equal(app.store.get("vehicles", vehicle.id).mileage, 30000);
    assert.equal(
      (await request("/api/demo", "board", { role: "admin" })).status,
      200,
    );
    assert.equal(
      (await request("/api/demo", "clients", { role: "client" })).status,
      200,
    );
    const client = await (await request("/api/state", "clients")).json();
    assert.equal(client.vehicles.length, 3);
    assert.equal(
      client.rentals.filter((r) => r.status === "reserved").length,
      1,
    );
    assert(client.documents.length >= 5);
    const companyDocument = client.documents.find(
      (d) => d.vehicleId === "DEMO-CLIENT-V1",
    );
    assert.equal((await request(companyDocument.file, "clients")).status, 200);
    assert.equal(
      (await request("/api/demo", "clients", { role: "driver" })).status,
      200,
    );
    const driver = await (await request("/api/state", "clients")).json();
    assert.deepEqual(
      driver.vehicles.map((v) => v.id),
      ["V-002"],
    );
    assert(driver.documents.length >= 3);
    assert(driver.documents.every((d) => d.vehicleId === "V-002"));
    assert(driver.rentals.length > 0);
    assert(
      driver.rentals.every(
        (r) => !("rate" in r) && !("customerId" in r) && !("contract" in r),
      ),
    );
    for (const action of ["rental.create", "document.save"]) {
      assert.equal(
        (await request("/api/action", "clients", { action, payload: {} }))
          .status,
        403,
      );
    }
    assert.equal((await request(companyDocument.file, "clients")).status, 403);
    const board = await (await request("/api/state", "board")).json();
    assert.equal(board.user.id, "demo-admin");
    assert(board.customers.length >= 6);
    assert.equal((await request("/api/logout", "clients", {})).status, 200);
    assert.equal((await request("/api/state", "clients")).status, 401);
    assert.equal((await request("/api/state", "board")).status, 200);
  } finally {
    await app.close();
  }
});
