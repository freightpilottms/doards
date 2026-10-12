import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.mjs";
import { seed, day, roles } from "./seed.mjs";
import {
  execute,
  snapshot,
  vehicleStatus,
  hashPassword,
  verifyPassword,
} from "./domain.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const signature =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const user = (role) => ({
  id: `demo-${role}`,
  role,
  name: role,
  customerId: ["driver", "client"].includes(role) ? "K-001" : "",
});
function fixture() {
  const s = createStore();
  for (const [kind, records] of Object.entries(seed()))
    for (const r of records) s.put(kind, r);
  for (const role of roles)
    s.db
      .prepare(
        "INSERT INTO users(id,email,name,role,customerId,password) VALUES(?,?,?,?,?,?)",
      )
      .run(
        `demo-${role}`,
        `${role}@test.local`,
        role,
        role,
        user(role).customerId,
        "test",
      );
  return s;
}
const rental = (overrides = {}) => ({
  vehicleId: "V-006",
  customerId: "K-001",
  driverId: "demo-driver",
  start: day(),
  end: day(3),
  rate: 110,
  deposit: 500,
  extras: 10,
  includedKm: 600,
  extraKmRate: 0.3,
  ...overrides,
});
const handover = (id, mileage = 61300) => ({
  id,
  mileage,
  fuel: 90,
  signature,
  checks: Array(8).fill("pass"),
  photos: [],
});
test("password hashing is salted and checks correct/incorrect credentials", () => {
  const h = hashPassword("strong-passphrase");
  assert(verifyPassword("strong-passphrase", h));
  assert(!verifyPassword("wrong", h));
  assert.notEqual(h, hashPassword("strong-passphrase"));
});
test("overlapping and touching bookings are rejected, distinct bookings succeed", () => {
  const s = fixture();
  execute(s, user("admin"), "rental.create", rental());
  assert.throws(
    () =>
      execute(
        s,
        user("employee"),
        "rental.create",
        rental({ start: day(3), end: day(5) }),
      ),
    /overlap/,
  );
  assert.ok(
    execute(
      s,
      user("employee"),
      "rental.create",
      rental({ start: day(4), end: day(6) }),
    ).id,
  );
  s.db.close();
});
test("workshop blocks booking and handover", () => {
  const s = fixture();
  assert.throws(
    () =>
      execute(
        s,
        user("admin"),
        "rental.create",
        rental({ vehicleId: "V-004" }),
      ),
    /vehicleBlocked/,
  );
  const r = execute(s, user("admin"), "rental.create", rental());
  execute(s, user("admin"), "vehicle.status", {
    id: "V-006",
    status: "blocked",
  });
  assert.throws(
    () => execute(s, user("admin"), "rental.handover", handover(r.id)),
    /vehicleBlocked/,
  );
  s.db.close();
});
test("rental lifecycle snapshots damage and calculates return charges", () => {
  const s = fixture();
  s.put("vehicles", {
    ...s.get("vehicles", "V-006"),
    photos: { front: signature },
  });
  const d = execute(s, user("admin"), "damage.create", {
    vehicleId: "V-006",
    description: "scratch",
    angle: "front",
    x: 0.5,
    y: 0.5,
  });
  const r = execute(s, user("admin"), "rental.create", rental());
  assert.equal(r.total, 340);
  const out = execute(s, user("employee"), "rental.handover", handover(r.id));
  assert.equal(out.handoverDamages[0], d.id);
  assert.equal(vehicleStatus(s, s.get("vehicles", "V-006")), "rented");
  const returned = execute(s, user("employee"), "rental.return", {
    ...handover(r.id, 62100),
    cleaning: 20,
    refuel: 10,
  });
  assert.equal(returned.extraKm, 200);
  assert.equal(returned.charges, 90);
  assert.equal(returned.total, 430);
  assert.equal(s.get("vehicles", "V-006").status, "inspection");
  assert.throws(
    () => execute(s, user("employee"), "rental.return", handover(r.id, 62100)),
    /invalidStatus/,
  );
  s.db.close();
});
test("odometer cannot move backwards and failed checklist blocks vehicle", () => {
  const s = fixture();
  assert.throws(
    () =>
      execute(
        s,
        user("employee"),
        "rental.return",
        handover("MV-2026-001", 40000),
      ),
    /invalidNumber/,
  );
  const r = execute(s, user("employee"), "rental.return", {
    ...handover("MV-2026-001", 47000),
    checks: ["fail", ...Array(7).fill("pass")],
  });
  assert.equal(s.get("vehicles", r.vehicleId).status, "maintenance");
  s.db.close();
});
test("stock issue is atomic and cannot be duplicated beyond available stock", () => {
  const s = fixture();
  execute(s, user("mechanic"), "work.part", {
    id: "WA-001",
    articleId: "ART-002",
    quantity: 2,
  });
  assert.equal(s.get("articles", "ART-002").stock, 1);
  const before = s.all("movements").length;
  assert.throws(
    () =>
      execute(s, user("mechanic"), "work.part", {
        id: "WA-001",
        articleId: "ART-002",
        quantity: 2,
      }),
    /insufficientStock/,
  );
  assert.equal(s.get("articles", "ART-002").stock, 1);
  assert.equal(s.all("movements").length, before);
  execute(s, user("mechanic"), "work.time", { id: "WA-001", hours: 2 });
  execute(s, user("mechanic"), "work.complete", { id: "WA-001" });
  assert.equal(s.all("costs").find((c) => c.workOrderId === "WA-001").net, 106);
  assert.throws(
    () => execute(s, user("mechanic"), "work.complete", { id: "WA-001" }),
    /invalidStatus/,
  );
  s.db.close();
});
test("partially received purchases increase stock exactly once", () => {
  const s = fixture();
  const p = execute(s, user("admin"), "purchase.create", {
    articleId: "ART-002",
    quantity: 10,
    unitCost: 12,
    tax: 20,
    date: day(),
    supplier: "Parts GmbH",
  });
  execute(s, user("warehouse"), "purchase.receive", { id: p.id, quantity: 4 });
  assert.equal(s.get("articles", "ART-002").stock, 7);
  assert.equal(s.get("purchases", p.id).status, "partial");
  execute(s, user("warehouse"), "purchase.receive", { id: p.id, quantity: 6 });
  assert.equal(s.get("articles", "ART-002").stock, 13);
  assert.throws(
    () =>
      execute(s, user("warehouse"), "purchase.receive", {
        id: p.id,
        quantity: 1,
      }),
    /invalidNumber/,
  );
  s.db.close();
});
test("invoice totals, partial payments, cancellation, immutable snapshots", () => {
  const s = fixture();
  s.put("settings", {
    ...s.get("settings", "company"),
    address: "Test address",
    taxId: "TEST-UID",
  });
  const i = execute(s, user("accountant"), "invoice.create", {
    customerId: "K-001",
    due: day(14),
    lines: [
      {
        articleId: "ART-002",
        description: "Filter",
        quantity: 2,
        price: 30,
        tax: 20,
      },
    ],
  });
  assert.equal(i.net, 60);
  assert.equal(i.vat, 12);
  assert.equal(i.gross, 72);
  assert.equal(s.get("articles", "ART-002").stock, 1);
  execute(s, user("accountant"), "payment.create", {
    invoiceId: i.id,
    amount: 20,
  });
  assert.equal(s.get("invoices", i.id).status, "partial");
  assert.throws(
    () =>
      execute(s, user("accountant"), "payment.create", {
        invoiceId: i.id,
        amount: 100,
      }),
    /invalidNumber/,
  );
  execute(s, user("accountant"), "payment.create", {
    invoiceId: i.id,
    amount: 52,
  });
  assert.equal(s.get("invoices", i.id).status, "paid");
  assert.throws(
    () =>
      execute(s, user("admin"), "invoice.cancel", { id: i.id, reason: "test" }),
    /invalidStatus/,
  );
  s.put("customers", { ...s.get("customers", "K-001"), name: "Changed" });
  assert.equal(s.get("invoices", i.id).customer.name, "Anna Müller");
  s.db.close();
});
test("deposit settlement does not create rental revenue or invoice payment", () => {
  const s = fixture();
  execute(s, user("employee"), "rental.return", handover("MV-2026-001", 47000));
  execute(s, user("accountant"), "deposit.settle", {
    id: "MV-2026-001",
    retained: 100,
  });
  assert.equal(s.get("rentals", "MV-2026-001").depositHeld, 0);
  assert.equal(s.get("rentals", "MV-2026-001").depositRetained, 100);
  assert.equal(s.all("payments")[0].type, "depositRefund");
  assert.equal(s.all("payments")[0].amount, 400);
  assert.throws(
    () =>
      execute(s, user("accountant"), "deposit.settle", {
        id: "MV-2026-001",
        retained: 100,
      }),
    /invalidStatus/,
  );
  s.db.close();
});
test("role scoping prevents driver access to unrelated vehicles and finance", () => {
  const s = fixture();
  const state = snapshot(s, user("driver"));
  assert.deepEqual(
    state.vehicles.map((v) => v.id),
    ["V-002"],
  );
  assert.equal(state.vehicles[0].purchasePrice, undefined);
  assert.deepEqual(state.invoices, []);
  assert.deepEqual(state.audit, []);
  assert.throws(
    () =>
      execute(s, user("driver"), "location.report", {
        vehicleId: "V-001",
        latitude: 48,
        longitude: 16,
        accuracy: 10,
      }),
    /forbidden/,
  );
  assert.throws(
    () => execute(s, user("driver"), "vehicle.save", { id: "V-002" }),
    /forbidden/,
  );
  assert.throws(
    () => execute(s, user("mechanic"), "invoice.create", {}),
    /forbidden/,
  );
  s.db.close();
});
test("financial data is removed from nested handover snapshots and purchasing", () => {
  const s = fixture();
  s.put("rentals", {
    ...s.get("rentals", "MV-2026-001"),
    handover: {
      damages: [
        {
          repairCost: 999,
          insurerShare: 200,
          customerShare: 20,
          description: "x",
        },
      ],
    },
  });
  s.put("purchases", { id: "P-1", unitCost: 100 });
  const employee = snapshot(s, user("employee"));
  assert.equal(employee.rentals[0].handover.damages[0].repairCost, undefined);
  assert.equal(snapshot(s, user("warehouse")).purchases[0].unitCost, undefined);
  s.db.close();
});
test("data and audit survive reopening the database", () => {
  const dir = mkdtempSync(join(tmpdir(), "doards-persistence-"));
  const path = join(dir, "test.sqlite");
  let s;
  try {
    s = createStore(path);
    s.put("vehicles", {
      id: "V-1",
      status: "available",
      photos: { front: signature },
    });
    execute(s, user("admin"), "vehicle.status", {
      id: "V-1",
      status: "blocked",
    });
    s.db.close();
    s = createStore(path);
    assert.equal(s.get("vehicles", "V-1").status, "blocked");
    assert.equal(s.get("vehicles", "V-1").photos.front, signature);
    assert.equal(s.db.prepare("SELECT count(*) AS n FROM audit").get().n, 1);
  } finally {
    s?.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("drivers inherit vehicle damage but not former renter identities or locations", () => {
  const s = fixture();
  s.put("rentals", {
    id: "OLD",
    vehicleId: "V-002",
    driverId: "former-driver",
    customerId: "former-client",
    status: "returned",
  });
  s.put("damages", {
    id: "OLD-DAMAGE",
    vehicleId: "V-002",
    rentalId: "OLD",
    driver: "Former driver",
    createdBy: "former-driver",
    description: "Existing scratch",
  });
  s.put("locations", {
    id: "OLD-LOCATION",
    vehicleId: "V-002",
    at: "2000-01-01T00:00:00Z",
  });
  execute(s, user("driver"), "location.report", {
    vehicleId: "V-002",
    latitude: 48,
    longitude: 16,
    accuracy: 10,
  });
  const state = snapshot(s, user("driver"));
  const damage = state.damages.find((d) => d.id === "OLD-DAMAGE");
  assert.equal(damage.description, "Existing scratch");
  assert.equal(damage.driver, undefined);
  assert.equal(damage.createdBy, undefined);
  assert.equal(damage.rentalId, undefined);
  assert.equal(state.locations.length, 1);
  assert.notEqual(state.locations[0].id, "OLD-LOCATION");
  s.db.close();
});

test("rental final invoices require a completed return", () => {
  const s = fixture();
  s.put("settings", {
    ...s.get("settings", "company"),
    address: "Test",
    taxId: "Test",
  });
  assert.throws(
    () =>
      execute(s, user("accountant"), "invoice.create", {
        rentalId: "MV-2026-001",
      }),
    /returnBeforeInvoice/,
  );
  assert.equal(s.all("invoices").length, 0);
  s.db.close();
});

test("hardware telemetry matches registered trackers and rejects unmapped devices", () => {
  const s = fixture();
  s.put("vehicles", { ...s.get("vehicles", "V-001"), trackerId: "tracker-1" });
  const location = execute(s, user("admin"), "location.ingest", {
    trackerId: "tracker-1",
    latitude: 48,
    longitude: 16,
    accuracy: 2,
  });
  assert.equal(location.source, "hardware");
  assert.equal(location.vehicleId, "V-001");
  assert.throws(
    () =>
      execute(s, user("admin"), "location.ingest", {
        trackerId: "unknown",
        latitude: 48,
        longitude: 16,
      }),
    /invalidTracker/,
  );
  assert.throws(
    () =>
      execute(s, user("driver"), "location.ingest", {
        trackerId: "tracker-1",
        latitude: 48,
        longitude: 16,
      }),
    /forbidden/,
  );
  s.db.close();
});

test("audit cannot be changed or removed and records actor, old and new", () => {
  const s = fixture();
  execute(s, user("admin"), "vehicle.status", {
    id: "V-001",
    status: "blocked",
  });
  const entry = s.db
    .prepare("SELECT * FROM audit ORDER BY seq DESC LIMIT 1")
    .get();
  assert.equal(entry.userId, "demo-admin");
  assert.equal(JSON.parse(entry.old).status, "available");
  assert.equal(JSON.parse(entry.new).status, "blocked");
  assert.ok(entry.hash);
  assert.throws(() => s.db.prepare("DELETE FROM audit").run(), /Append-only/);
  assert.throws(
    () => s.db.prepare("UPDATE audit SET action='x'").run(),
    /Append-only/,
  );
  s.db.close();
});
