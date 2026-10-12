import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.mjs";
import { seed } from "./seed.mjs";
import {
  surfaceUser,
  appAccess,
  can,
  execute,
  snapshot,
  notifyChange,
  authorizedMedia,
} from "./domain.mjs";
const actor = (role, access = {}) => ({
  id: `demo-${role}`,
  name: role,
  role,
  customerId: "K-001",
  access,
});
function fixture() {
  const s = createStore();
  for (const [k, rows] of Object.entries(seed()))
    for (const row of rows) s.put(k, row);
  for (const role of ["admin", "mechanic", "warehouse", "client", "driver"]) {
    const u = actor(role);
    s.db
      .prepare(
        "INSERT INTO users(id,name,email,role,customerId,password) VALUES(?,?,?,?,?,?)",
      )
      .run(u.id, u.name, role + "@example.com", role, u.customerId, "test");
  }
  return s;
}
test("one identity can access both portals without broadening client data scope", () => {
  const u = actor("mechanic", {
    apps: { clients: true, workshop: true, board: false },
    clientScope: { view: true },
  });
  assert.equal(surfaceUser(u, "clients").role, "client");
  assert.equal(surfaceUser(u, "workshop").role, "mechanic");
  assert.throws(() => surfaceUser(u, "board"), /appForbidden/);
  const s = fixture();
  assert.deepEqual(
    snapshot(s, surfaceUser(u, "clients")).vehicles.map((v) => v.id),
    ["V-002"],
  );
  assert.equal(snapshot(s, surfaceUser(u, "clients")).articles.length, 0);
  s.db.close();
});
test("workshop and inventory writes have independent server-enforced permissions", () => {
  const s = fixture();
  const warehouse = surfaceUser(actor("warehouse"), "workshop");
  assert.equal(can(warehouse, "workOrders"), true);
  assert.equal(can(warehouse, "workOrders", "edit"), false);
  assert.throws(
    () => execute(s, warehouse, "work.time", { id: "WA-001", hours: 1 }),
    /forbidden/,
  );
  execute(s, warehouse, "stock.move", {
    articleId: "ART-001",
    type: "inventory",
    quantity: 1,
    reason: "Count",
  });
  const mechanic = surfaceUser(
    actor("mechanic", {
      articles: { view: true, create: false, edit: false },
      workOrders: { view: true, edit: true },
    }),
    "workshop",
  );
  execute(s, mechanic, "work.time", { id: "WA-001", hours: 1 });
  assert.throws(
    () =>
      execute(s, mechanic, "stock.move", {
        articleId: "ART-001",
        type: "inventory",
        quantity: 1,
        reason: "Count",
      }),
    /forbidden/,
  );
  assert.throws(
    () =>
      execute(s, mechanic, "work.part", {
        id: "WA-001",
        articleId: "ART-001",
        quantity: 1,
      }),
    /forbidden/,
  );
  s.db.close();
});
test("private workshop messages and attachments never enter the client portal", () => {
  const s = fixture(),
    mechanic = surfaceUser(actor("mechanic"), "workshop"),
    driver = surfaceUser(actor("driver"), "clients");
  const m = execute(s, mechanic, "message.send", {
    vehicleId: "V-002",
    channel: "workshop",
    body: "Internal",
    attachments: [
      { name: "note.pdf", file: "data:application/pdf;base64,JVBERi0xLjQ=" },
    ],
  });
  assert.equal(snapshot(s, driver).messages.length, 0);
  assert.throws(
    () => authorizedMedia(s, driver, "messages", m.id, "attachments.0.file"),
    /forbidden/,
  );
  assert.throws(
    () =>
      execute(s, driver, "message.send", {
        vehicleId: "V-002",
        channel: "workshop",
        body: "Attempt",
      }),
    /forbidden/,
  );
  assert.equal(
    authorizedMedia(s, mechanic, "messages", m.id, "attachments.0.file").type,
    "application/pdf",
  );
  s.db.close();
});
test("message notifications and read states are persistent and user-specific", () => {
  const s = fixture(),
    admin = surfaceUser(actor("admin"), "board"),
    driver = surfaceUser(actor("driver"), "clients"),
    client = surfaceUser(actor("client"), "clients");
  const m = execute(s, admin, "message.send", {
    vehicleId: "V-002",
    channel: "clients",
    body: "Return at noon",
  });
  notifyChange(s, admin, "message.send", m);
  const notice = snapshot(s, driver).notifications.find(
    (n) => n.recordId === m.id,
  );
  assert(notice);
  execute(s, driver, "notification.read", { id: notice.id });
  assert(
    snapshot(s, driver).notifications.find((n) => n.id === notice.id).read,
  );
  assert(
    snapshot(s, client).notifications.some(
      (n) => n.recordId === m.id && !n.read,
    ),
  );
  execute(s, driver, "message.read", {
    vehicleId: "V-002",
    channel: "clients",
  });
  assert.equal(snapshot(s, driver).messageReceipts[0].userId, driver.id);
  s.db.close();
});
test("a private individual driver does not need a corporate customer association", () => {
  const s = fixture();
  const admin = actor("admin");
  const u = execute(s, admin, "user.create", {
    role: "driver",
    name: "Independent Driver",
    email: "private@example.com",
    password: "long-enough-password",
  });
  assert.equal(u.customerId, "");
  assert.equal(appAccess(u).clients, true);
  const r = execute(s, admin, "rental.create", {
    vehicleId: "V-006",
    customerId: "K-002",
    driverId: u.id,
    start: new Date().toISOString().slice(0, 10),
    end: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    rate: 110,
  });
  assert.equal(r.driverId, u.id);
  s.db.close();
});
