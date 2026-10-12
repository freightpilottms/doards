import {
  randomUUID,
  scryptSync,
  timingSafeEqual,
  randomBytes,
  createHash,
} from "node:crypto";
import { roles, day } from "./seed.mjs";
import { closedPeriods, serviceAlerts } from "./automation-rules.mjs";

export class DomainError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.status = status;
  }
}
const fail = (code, status) => {
  throw new DomainError(code, status);
};
const required = (v) =>
  typeof v === "string" && v.trim() ? v.trim() : fail("required");
const num = (v, min = 0, max = 1e12) =>
  Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max
    ? Number(v)
    : fail("invalidNumber");
const date = (v) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v || "") &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v
    ? v
    : fail("invalidDate");
export const money = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
export const days = (start, end) =>
  Math.max(1, Math.ceil((Date.parse(end) - Date.parse(start)) / 86400000));
export const hashPassword = (password) => {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
};
export function verifyPassword(password, hash) {
  const [salt, key] = hash.split(":");
  return (
    !!key &&
    timingSafeEqual(Buffer.from(key, "hex"), scryptSync(password, salt, 64))
  );
}
export const permissions = {
  admin: [
    "vehicles",
    "rentals",
    "customers",
    "damages",
    "workOrders",
    "articles",
    "purchases",
    "invoices",
    "payments",
    "costs",
    "services",
    "repairs",
    "documents",
    "tasks",
    "messages",
    "locations",
    "users",
    "settings",
    "finance",
    "audit",
    "export",
  ],
  employee: [
    "vehicles",
    "rentals",
    "customers",
    "damages",
    "services",
    "repairs",
    "documents",
    "tasks",
    "messages",
    "locations",
  ],
  mechanic: [
    "vehicles",
    "damages",
    "workOrders",
    "articles",
    "services",
    "repairs",
    "documents",
    "tasks",
    "messages",
  ],
  warehouse: [
    "vehicles",
    "workOrders",
    "articles",
    "purchases",
    "documents",
    "messages",
    "tasks",
  ],
  accountant: [
    "vehicles",
    "customers",
    "rentals",
    "invoices",
    "payments",
    "articles",
    "purchases",
    "costs",
    "repairs",
    "documents",
    "finance",
    "export",
  ],
  client: [
    "vehicles",
    "rentals",
    "damages",
    "documents",
    "messages",
    "locations",
  ],
  driver: [
    "vehicles",
    "rentals",
    "damages",
    "documents",
    "messages",
    "locations",
  ],
};
export const accessOf = (user) =>
  typeof user.access === "string"
    ? JSON.parse(user.access || "{}")
    : user.access || {};
export const appAccess = (u) => {
  const defaults = {
    board: !["client", "driver"].includes(u.role),
    clients: ["admin", "client", "driver"].includes(u.role),
    workshop: ["admin", "mechanic", "warehouse"].includes(u.role),
  };
  const overrides = accessOf(u).apps || {};
  return Object.fromEntries(
    Object.entries(defaults).map(([k, v]) => [
      k,
      typeof overrides[k] === "boolean" ? overrides[k] : v,
    ]),
  );
};
export function surfaceUser(u, requested) {
  const apps = appAccess(u);
  const surface =
    requested ||
    (["client", "driver"].includes(u.role)
      ? "clients"
      : ["mechanic", "warehouse"].includes(u.role)
        ? "workshop"
        : "board");
  if (!["board", "clients", "workshop"].includes(surface) || !apps[surface])
    fail("appForbidden", 403);
  const role =
    surface === "clients"
      ? u.role === "client" || accessOf(u).clientScope?.view === true
        ? "client"
        : "driver"
      : surface === "workshop"
        ? u.role === "warehouse"
          ? "warehouse"
          : "mechanic"
        : u.role;
  return { ...u, role, baseRole: u.role, surface, apps };
}
export const can = (user, permission, operation = "view") => {
  const rule = accessOf(user)[permission];
  if (
    user.role === "driver" &&
    ["rentals", "documents"].includes(permission) &&
    operation !== "view"
  )
    return false;
  if (permission === "notifications") return true;
  if (
    user.role === "warehouse" &&
    ["vehicles", "workOrders", "tasks"].includes(permission) &&
    operation !== "view"
  )
    return rule?.view !== false && rule?.[operation] === true;
  if (permission === "finance" && typeof rule?.view === "boolean")
    return !!permissions[user.role]?.includes(permission) && rule.view;
  if (permission === "purchasePrices")
    return (
      ["admin", "accountant"].includes(user.role) ||
      (user.role === "warehouse" && rule?.view === true)
    );
  return (
    !!permissions[user.role]?.includes(permission) &&
    rule?.[operation] !== false &&
    rule?.view !== false
  );
};
const internal = (u) => !["client", "driver"].includes(u.role);
export const finance = (u) => can(u, "finance");
const privateFinancialFields = new Set([
  "purchasePrice",
  "acquisitionCosts",
  "costPrice",
  "unitCost",
  "laborCost",
  "repairCost",
  "insurerShare",
  "customerShare",
  "cost",
  "gross",
  "net",
  "priceHistory",
]);
function redactFinancial(value) {
  if (Array.isArray(value)) return value.map(redactFinancial);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !privateFinancialFields.has(key))
        .map(([key, v]) => [key, redactFinancial(v)]),
    );
  return value;
}
export function visibleVehicleIds(s, u) {
  if (internal(u)) return new Set(s.all("vehicles").map((v) => v.id));
  return new Set(
    s
      .all("rentals")
      .filter(
        (r) =>
          ["reserved", "active"].includes(r.status) &&
          (u.role === "client"
            ? r.customerId === u.customerId
            : r.driverId === u.id),
      )
      .map((r) => r.vehicleId),
  );
}
export function vehicleStatus(s, v) {
  if (["maintenance", "blocked", "inspection"].includes(v.status))
    return v.status;
  const rentals = s.all("rentals").filter((r) => r.vehicleId === v.id);
  return rentals.some((r) => r.status === "active")
    ? "rented"
    : rentals.some(
          (r) => r.status === "reserved" && r.start <= day() && r.end >= day(),
        )
      ? "reserved"
      : "available";
}
export function snapshot(s, u) {
  const ids = visibleVehicleIds(s, u);
  const rentVisible = (r) =>
    internal(u) ||
    (u.role === "client" ? r.customerId === u.customerId : r.driverId === u.id);
  const result = {};
  for (const kind of [
    "vehicles",
    "customers",
    "rentals",
    "damages",
    "workOrders",
    "articles",
    "purchases",
    "invoices",
    "payments",
    "costs",
    "services",
    "repairs",
    "documents",
    "messages",
    "tasks",
    "locations",
    "settings",
    "movements",
  ]) {
    const permission = kind === "movements" ? "articles" : kind;
    if (kind !== "settings" && !can(u, permission)) {
      result[kind] = [];
      continue;
    }
    let records = s.all(kind);
    if (kind === "settings")
      records = records.filter((r) => r.id === "company");
    if (kind === "vehicles")
      records = records
        .filter((v) => ids.has(v.id))
        .map((v) => ({ ...v, status: vehicleStatus(s, v) }));
    else if (kind === "rentals") records = records.filter(rentVisible);
    else if (!internal(u)) {
      if (kind === "settings")
        records = records.map((x) => ({
          id: x.id,
          name: x.name,
          address: x.address,
          email: x.email,
          terms: x.terms,
          tax: x.tax,
        }));
      else if (kind === "damages")
        records = records.filter((r) => ids.has(r.vehicleId));
      else if (kind === "locations")
        records = records.filter((location) =>
          s
            .all("rentals")
            .some(
              (r) =>
                r.vehicleId === location.vehicleId &&
                r.status === "active" &&
                rentVisible(r) &&
                location.at >= (r.handover?.at || r.start + "T00:00:00"),
            ),
        );
      else
        records = records.filter(
          (r) =>
            ids.has(r.vehicleId) &&
            (!r.rentalId ||
              (s.get("rentals", r.rentalId) &&
                rentVisible(s.get("rentals", r.rentalId)))),
        );
    }
    if (kind === "documents")
      records = records.filter(
        (d) => (!d.financial || finance(u)) && (internal(u) || d.shared),
      );
    if (kind === "messages")
      records = records.filter(
        (m) =>
          (m.channel === "workshop"
            ? internal(u) && u.surface !== "clients"
            : u.surface !== "workshop") &&
          (internal(u) ||
            (u.role === "client" && m.customerId === u.customerId) ||
            m.senderId === u.id ||
            m.recipientId === u.id),
      );
    result[kind] = records.map((record) => {
      if (u.role === "driver" && kind === "rentals")
        return Object.fromEntries(
          ["id", "vehicleId", "driverId", "start", "end", "status"].map(
            (key) => [key, record[key]],
          ),
        );
      const r = { ...record };
      if (!finance(u))
        for (const k of [
          "purchasePrice",
          "acquisitionCosts",
          "costPrice",
          "laborCost",
          "repairCost",
          "insurerShare",
          "customerShare",
          "cost",
          "gross",
          "net",
          "priceHistory",
        ])
          delete r[k];
      if (!internal(u))
        for (const k of [
          "insuranceEmail",
          "insuranceBroker",
          "insurancePolicy",
          "trackerId",
          "notes",
        ])
          delete r[k];
      if (!internal(u) && kind === "damages") {
        delete r.driver;
        delete r.createdBy;
        if (r.rentalId && !rentVisible(s.get("rentals", r.rentalId) || {}))
          delete r.rentalId;
      }
      if (kind === "workOrders" && !finance(u))
        r.parts = (r.parts || []).map(({ cost, ...p }) => p);
      const safe = finance(u) ? r : redactFinancial(r);
      if (can(u, "purchasePrices")) {
        if (kind === "articles") {
          safe.costPrice = record.costPrice;
          safe.priceHistory = record.priceHistory;
        }
        if (kind === "purchases") safe.unitCost = record.unitCost;
      }
      return safe;
    });
  }
  result.users =
    u.role === "admin"
      ? s.db
          .prepare("SELECT id,email,name,role,customerId,access FROM users")
          .all()
          .map((x) => ({ ...x, access: accessOf(x) }))
      : internal(u)
        ? s.db
            .prepare(
              "SELECT id,name,role,customerId FROM users WHERE role IN ('mechanic','driver','employee')",
            )
            .all()
        : [];
  const auditValue = (value) => {
    if (typeof value === "string" && value.startsWith("data:"))
      return { mediaHash: createHash("sha256").update(value).digest("hex") };
    if (Array.isArray(value)) return value.map(auditValue);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, auditValue(v)]),
      );
    return value;
  };
  result.audit =
    u.role === "admin"
      ? s.db
          .prepare("SELECT * FROM audit ORDER BY seq DESC LIMIT 300")
          .all()
          .map((r) => ({
            ...r,
            old: auditValue(JSON.parse(r.old)),
            new: auditValue(JSON.parse(r.new)),
          }))
      : [];
  const mediaReferences = (value, kind, id, path = "") => {
    if (typeof value === "string" && value.startsWith("data:"))
      return `/api/media/${kind}/${encodeURIComponent(id)}?path=${encodeURIComponent(path)}&app=${u.surface || ""}&v=${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
    if (Array.isArray(value))
      return value.map((v, i) => mediaReferences(v, kind, id, `${path}.${i}`));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, v]) => [
          key,
          mediaReferences(v, kind, id, path ? `${path}.${key}` : key),
        ]),
      );
    return value;
  };
  for (const kind of [
    "vehicles",
    "damages",
    "documents",
    "rentals",
    "messages",
  ])
    result[kind] = result[kind].map((r) => mediaReferences(r, kind, r.id));
  const granted = permissions[u.role].filter((p) => can(u, p));
  if (can(u, "purchasePrices")) granted.push("purchasePrices");
  if (u.role === "admin") result.rolePermissions = permissions;
  result.notifications = notificationsFor(s, u);
  result.messageReceipts = s
    .all("messageReceipts")
    .filter(
      (r) =>
        r.userId === u.id ||
        result.messages.some(
          (m) =>
            m.vehicleId === r.vehicleId &&
            (m.channel || "clients") === r.channel &&
            (internal(u) ||
              m.senderId === r.userId ||
              m.recipientId === r.userId),
        ),
    );
  return {
    ...result,
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      customerId: u.customerId,
      access: accessOf(u),
      apps: u.apps || appAccess(u),
      surface: u.surface || "board",
      baseRole: u.baseRole || u.role,
    },
    permissions: [
      ...granted,
      ...(finance(u) && !granted.includes("finance") ? ["finance"] : []),
      ...granted.flatMap((p) =>
        ["create", "edit", "cancel", "export"]
          .filter((op) => can(u, p, op))
          .map((op) => `${p}:${op}`),
      ),
    ],
    serverTime: new Date().toISOString(),
  };
}
export function execute(s, u, action, p = {}) {
  return s.transaction(() => {
    const [resource, verb] = String(action).split(".");
    const collection = {
      vehicle: "vehicles",
      customer: "customers",
      rental: "rentals",
      deposit: "payments",
      damage: "damages",
      work: "workOrders",
      service: "services",
      repair: "repairs",
      article: "articles",
      stock: "articles",
      purchase: "purchases",
      cost: "costs",
      invoice: "invoices",
      payment: "payments",
      document: "documents",
      message: "messages",
      location: "locations",
      task: "tasks",
      settings: "settings",
      user: "users",
      notification: "notifications",
    }[resource];
    const operation =
      verb === "read"
        ? "view"
        : ["create", "send", "report", "monthly"].includes(verb) ||
            (verb === "save" && !p.id)
          ? "create"
          : verb === "cancel"
            ? "cancel"
            : "edit";
    if (!collection || !can(u, collection, operation)) fail("forbidden", 403);
    const need = (permission) => can(u, permission) || fail("forbidden", 403);
    const find = (kind, id) => s.get(kind, id) || fail("notFound", 404);
    const vehicle = (id) => {
      const v = find("vehicles", id);
      if (!visibleVehicleIds(s, u).has(id)) fail("forbidden", 403);
      return v;
    };
    const save = (kind, r) => s.save(u, kind, r, action);
    const id = (prefix) =>
      `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    const requireInternal = () => internal(u) || fail("forbidden", 403);
    if (action === "notification.read") {
      const visible = notificationsFor(s, u).filter(
        (n) => p.all || n.id === p.id,
      );
      for (const n of visible)
        s.put("notificationReads", {
          id: `${u.id}:${n.id}`,
          userId: u.id,
          notificationId: n.id,
          at: now,
        });
      return { id: p.id || "all" };
    }
    if (action === "message.read") {
      vehicle(p.vehicleId);
      const channel = p.channel === "workshop" ? "workshop" : "clients";
      if (
        (channel === "workshop" && !internal(u)) ||
        (u.surface === "workshop" && channel !== "workshop")
      )
        fail("forbidden", 403);
      return save("messageReceipts", {
        id: `${u.id}:${channel}:${p.vehicleId}`,
        userId: u.id,
        vehicleId: p.vehicleId,
        channel,
        at: now,
      });
    }
    if (action === "vehicle.save") {
      need("vehicles");
      if (!["admin", "employee"].includes(u.role)) fail("forbidden", 403);
      const old = p.id ? vehicle(p.id) : {};
      const vin = required(p.vin).toUpperCase();
      if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) fail("invalidVin");
      if (
        s
          .all("vehicles")
          .some(
            (v) =>
              v.id !== p.id &&
              (v.vin === vin ||
                v.plate.toUpperCase() === String(p.plate).toUpperCase()),
          )
      )
        fail("duplicateVehicle");
      const r = { ...old, id: old.id || id("V") };
      for (const k of ["make", "model", "plate", "type", "location"])
        r[k] = required(p[k]);
      for (const k of [
        "insuranceProvider",
        "insuranceBroker",
        "insuranceEmail",
        "insurancePolicy",
        "notes",
        "trackerId",
        "tireType",
      ])
        r[k] = String(p[k] ?? old[k] ?? "").slice(0, 4000);
      for (const k of [
        "inspectionDue",
        "insuranceDue",
        "serviceDue",
        "lastServiceDate",
        "tireDate",
        "acquired",
      ])
        r[k] = p[k] ? date(p[k]) : old[k] || "";
      r.vin = vin;
      r.year = num(p.year, 1900, new Date().getFullYear() + 2);
      r.mileage = num(p.mileage, old.mileage || 0);
      r.fuel = num(p.fuel ?? old.fuel ?? 100, 0, 100);
      r.dayRate = num(p.dayRate);
      r.serviceKm = num(p.serviceKm || 0);
      r.lastServiceKm = num(p.lastServiceKm || 0);
      r.baselineKm = old.baselineKm ?? r.mileage;
      r.photos = old.photos || {};
      r.status = old.status || "available";
      if (finance(u)) {
        r.purchasePrice = num(p.purchasePrice || 0);
        r.acquisitionCosts = num(p.acquisitionCosts || 0);
      }
      return save("vehicles", r);
    }
    if (action === "vehicle.status") {
      need("vehicles");
      if (!["admin", "employee", "mechanic"].includes(u.role))
        fail("forbidden", 403);
      const v = vehicle(p.id);
      if (
        !["available", "maintenance", "blocked", "inspection"].includes(
          p.status,
        )
      )
        fail("invalidStatus");
      if (
        p.status === "available" &&
        s
          .all("workOrders")
          .some((w) => w.vehicleId === v.id && w.status !== "complete")
      )
        fail("openWorkOrder");
      return save("vehicles", { ...v, status: p.status });
    }
    if (action === "vehicle.photo") {
      need("vehicles");
      if (!["admin", "employee", "mechanic"].includes(u.role))
        fail("forbidden", 403);
      const v = vehicle(p.id);
      if (
        ![
          "front",
          "frontRight",
          "right",
          "rearRight",
          "rear",
          "rearLeft",
          "left",
          "frontLeft",
        ].includes(p.angle)
      )
        fail("required");
      imageData(p.photo);
      return save("vehicles", {
        ...v,
        photos: { ...v.photos, [p.angle]: p.photo },
      });
    }
    if (action === "customer.save") {
      need("customers");
      const r = { id: p.id || id("K"), name: required(p.name) };
      for (const k of [
        "company",
        "email",
        "phone",
        "address",
        "license",
        "identity",
      ])
        r[k] = String(p[k] || "").slice(0, 1000);
      return save("customers", r);
    }
    if (action === "rental.create") {
      need("rentals");
      requireInternal();
      const v = vehicle(p.vehicleId);
      find("customers", p.customerId);
      const start = date(p.start),
        end = date(p.end);
      if (end < start) fail("invalidPeriod");
      if (["maintenance", "blocked", "inspection"].includes(v.status))
        fail("vehicleBlocked");
      if (
        s
          .all("rentals")
          .some(
            (r) =>
              r.vehicleId === v.id &&
              ["reserved", "active"].includes(r.status) &&
              start <= r.end &&
              end >= r.start,
          )
      )
        fail("overlap");
      if (p.driverId) {
        const driver = s.db
          .prepare("SELECT * FROM users WHERE id=?")
          .get(p.driverId);
        if (
          !driver ||
          driver.role !== "driver" ||
          (driver.customerId && driver.customerId !== p.customerId)
        )
          fail("invalidDriver");
      }
      const rate = num(p.rate ?? v.dayRate),
        extras = num(p.extras || 0),
        deposit = num(p.deposit || 0);
      const customer = find("customers", p.customerId),
        company = s.get("settings", "company") || {};
      const contract = {
        createdAt: now,
        billingMode: p.billingMode === "final" ? "final" : "monthly",
        company: {
          name: company.name,
          address: company.address,
          email: company.email,
          taxId: company.taxId,
          terms: company.terms,
        },
        customer: {
          name: customer.name,
          company: customer.company,
          address: customer.address,
          license: customer.license,
        },
        vehicle: {
          id: v.id,
          make: v.make,
          model: v.model,
          plate: v.plate,
          vin: v.vin,
        },
      };
      return save("rentals", {
        id: id("MV"),
        vehicleId: v.id,
        customerId: p.customerId,
        driverId: p.driverId || "",
        start,
        end,
        rate,
        billingMode: p.billingMode === "final" ? "final" : "monthly",
        extras,
        deposit,
        depositHeld: 0,
        depositRetained: 0,
        total: money(days(start, end) * rate + extras),
        status: "reserved",
        includedKm: num(p.includedKm || 0),
        extraKmRate: num(p.extraKmRate || 0),
        paymentMethod: p.paymentMethod || "transfer",
        notes: String(p.notes || ""),
        createdAt: now,
        contract,
      });
    }
    if (action === "rental.handover" || action === "rental.return") {
      need("rentals");
      if (!["admin", "employee"].includes(u.role)) fail("forbidden", 403);
      const r = find("rentals", p.id),
        v = vehicle(r.vehicleId),
        out = action === "rental.handover";
      if (r.status !== (out ? "reserved" : "active")) fail("invalidStatus");
      if (out && (day() < r.start || day() > r.end)) fail("pickupNotDue");
      if (
        out &&
        (["maintenance", "blocked", "inspection"].includes(v.status) ||
          s
            .all("rentals")
            .some(
              (x) =>
                x.id !== r.id && x.vehicleId === v.id && x.status === "active",
            ))
      )
        fail("vehicleBlocked");
      const mileage = num(p.mileage, Math.max(v.mileage, r.outMileage || 0)),
        fuel = num(p.fuel, 0, 100);
      imageData(p.signature);
      if (
        !Array.isArray(p.checks) ||
        p.checks.length !== 8 ||
        p.checks.some((c) => !["pass", "watch", "fail"].includes(c))
      )
        fail("checklistRequired");
      if (out && p.checks.includes("fail")) fail("handoverBlocked");
      const photos = (p.photos || []).slice(0, 8);
      photos.forEach(imageData);
      const report = {
        mileage,
        fuel,
        signature: p.signature,
        checks: p.checks,
        photos,
        at: now,
        by: u.id,
        damages: s
          .all("damages")
          .filter((d) => d.vehicleId === v.id && d.status !== "closed")
          .map((d) => ({ ...d })),
        notes: String(p.notes || ""),
      };
      let result;
      if (out)
        result = {
          ...r,
          status: "active",
          outMileage: mileage,
          outFuel: fuel,
          handover: report,
          handoverDamages: report.damages.map((d) => d.id),
          depositHeld: r.deposit,
          contract: {
            ...(r.contract || {}),
            signedAt: now,
            signedTotal: r.total,
            signature: p.signature,
          },
        };
      else {
        const extraKm = Math.max(0, mileage - r.outMileage - r.includedKm),
          cleaning = num(p.cleaning || 0),
          refuel = num(p.refuel || 0),
          other = num(p.other || 0),
          extraDays = Math.max(
            0,
            Math.ceil((Date.parse(day()) - Date.parse(r.end)) / 86400000),
          ),
          charges = money(
            extraKm * r.extraKmRate +
              extraDays * r.rate +
              cleaning +
              refuel +
              other,
          );
        result = {
          ...r,
          status: "returned",
          return: report,
          extraKm,
          extraDays,
          charges,
          cleaning,
          refuel,
          other,
          total: money(r.total + charges),
          returnedAt: now,
        };
      }
      save("vehicles", {
        ...v,
        mileage,
        fuel,
        status: out
          ? "available"
          : p.checks.includes("fail")
            ? "maintenance"
            : "inspection",
      });
      return save("rentals", result);
    }
    if (action === "rental.cancel") {
      need("rentals");
      requireInternal();
      const r = find("rentals", p.id);
      if (r.status !== "reserved") fail("invalidStatus");
      return save("rentals", { ...r, status: "cancelled" });
    }
    if (action === "deposit.settle") {
      need("payments");
      const r = find("rentals", p.id);
      if (r.status !== "returned" || r.depositHeld <= 0) fail("invalidStatus");
      const retained = num(p.retained, 0, r.depositHeld);
      save("payments", {
        id: id("PAY"),
        rentalId: r.id,
        vehicleId: r.vehicleId,
        type: "depositRefund",
        amount: money(r.depositHeld - retained),
        method: p.method || r.paymentMethod,
        at: now,
      });
      return save("rentals", {
        ...r,
        depositHeld: 0,
        depositRetained: retained,
        depositSettledAt: now,
      });
    }
    if (action === "damage.create") {
      need("damages");
      const v = vehicle(p.vehicleId);
      if (p.rentalId) {
        const r = find("rentals", p.rentalId);
        if (r.vehicleId !== v.id) fail("invalidLink");
      }
      const angle = String(p.angle || "frontRight");
      const positioned = p.x !== undefined && p.y !== undefined;
      if (positioned && !v.photos[angle]) fail("photoRequired");
      return save("damages", {
        id: id("SCH"),
        vehicleId: v.id,
        rentalId: p.rentalId || "",
        description: required(p.description),
        angle,
        x: positioned ? num(p.x, 0, 1) : null,
        y: positioned ? num(p.y, 0, 1) : null,
        positioned,
        photo: v.photos[angle] || (p.evidence ? imageData(p.evidence) : ""),
        evidence: p.evidence ? imageData(p.evidence) : "",
        status: "new",
        createdAt: now,
        createdBy: u.id,
        driver: u.name,
        repairCost: 0,
        insurerShare: 0,
        customerShare: 0,
      });
    }
    if (action === "damage.update") {
      need("damages");
      requireInternal();
      const r = find("damages", p.id);
      if (
        ![
          "new",
          "review",
          "estimate",
          "insurance",
          "workshop",
          "repaired",
          "billed",
          "closed",
        ].includes(p.status)
      )
        fail("invalidStatus");
      const costs = finance(u)
        ? {
            repairCost: num(p.repairCost || 0),
            insurerShare: num(p.insurerShare || 0),
            customerShare: num(p.customerShare || 0),
          }
        : {};
      if (costs.insurerShare + costs.customerShare > costs.repairCost)
        fail("invalidNumber");
      return save("damages", {
        ...r,
        ...costs,
        status: p.status,
        updatedAt: now,
      });
    }
    if (action === "work.create") {
      need("workOrders");
      if (p.vehicleId) vehicle(p.vehicleId);
      else find("customers", p.customerId);
      if (p.damageId && find("damages", p.damageId).vehicleId !== p.vehicleId)
        fail("invalidLink");
      const r = {
        id: id("WA"),
        vehicleId: p.vehicleId || "",
        customerId: p.customerId || "",
        damageId: p.damageId || "",
        description: required(p.description),
        due: date(p.due),
        priority: p.priority || "normal",
        assignedTo: p.assignedTo || u.id,
        status: "planned",
        hours: 0,
        laborCost: finance(u) ? num(p.laborCost || 38) : 38,
        laborRate: num(p.laborRate || 75),
        parts: [],
        createdAt: now,
      };
      return save("workOrders", r);
    }
    if (action.startsWith("work.")) {
      need("workOrders");
      const r = find("workOrders", p.id);
      if (r.status === "complete") fail("invalidStatus");
      if (action === "work.start") {
        if (r.timerAt) fail("invalidStatus");
        if (r.vehicleId) {
          const v = vehicle(r.vehicleId);
          if (vehicleStatus(s, v) === "rented") fail("vehicleBlocked");
          save("vehicles", { ...v, status: "maintenance" });
        }
        return save("workOrders", {
          ...r,
          status: "progress",
          startedAt: r.startedAt || now,
          timerAt: now,
          timerBy: u.id,
        });
      }
      if (action === "work.time") {
        const hours =
          p.stop && r.timerAt
            ? (Date.now() - Date.parse(r.timerAt)) / 3600000
            : num(p.hours, 0.01, 24);
        return save("workOrders", {
          ...r,
          hours: money(r.hours + hours),
          times: [
            ...(r.times || []),
            {
              hours: money(hours),
              userId: p.stop ? r.timerBy || u.id : u.id,
              at: now,
            },
          ],
          timerAt: null,
          status: "progress",
        });
      }
      if (action === "work.part") {
        if (!can(u, "articles", "edit")) fail("forbidden", 403);
        const a = find("articles", p.articleId),
          quantity = num(p.quantity, 0.001);
        if (a.stock - a.reserved < quantity) fail("insufficientStock");
        save("articles", { ...a, stock: money(a.stock - quantity) });
        save("movements", {
          id: id("MOV"),
          articleId: a.id,
          workOrderId: r.id,
          vehicleId: r.vehicleId,
          quantity: -quantity,
          type: "workshop",
          at: now,
          userId: u.id,
        });
        return save("workOrders", {
          ...r,
          parts: [
            ...r.parts,
            {
              articleId: a.id,
              name: a.name,
              quantity,
              cost: a.costPrice,
              price: a.salePrice,
              tax: a.tax,
            },
          ],
        });
      }
      if (action === "work.complete") {
        if (r.timerAt) fail("stopTimerFirst");
        if (r.vehicleId) {
          const v = vehicle(r.vehicleId);
          const net = money(
            r.hours * r.laborCost +
              r.parts.reduce((sum, p) => sum + p.quantity * p.cost, 0),
          );
          save("costs", {
            id: id("KO"),
            vehicleId: r.vehicleId,
            workOrderId: r.id,
            date: day(),
            category: "repair",
            supplier: "internal",
            description: r.description,
            net,
            tax: 0,
            gross: net,
            source: "workshop",
          });
          save("vehicles", { ...v, status: "inspection" });
          save("repairs", {
            id: id("REP"),
            vehicleId: v.id,
            workOrderId: r.id,
            damageId: r.damageId || "",
            type: "internal",
            supplier: "internal",
            description: r.description,
            date: day(),
            mileage: v.mileage,
            net,
            createdAt: now,
          });
        }
        return save("workOrders", {
          ...r,
          status: "complete",
          completedAt: now,
        });
      }
    }
    if (action === "repair.create") {
      need("repairs");
      requireInternal();
      const v = vehicle(p.vehicleId);
      const net = finance(u) ? num(p.net || 0) : 0,
        tax = finance(u) ? num(p.tax || 0, 0, 100) : 0;
      const repair = {
        id: id("REP"),
        vehicleId: v.id,
        type: "external",
        supplier: required(p.supplier),
        description: required(p.description),
        date: date(p.date),
        mileage: num(p.mileage, 0, v.mileage),
        damageId: p.damageId || "",
        invoiceNumber: String(p.invoiceNumber || ""),
        net,
        createdAt: now,
      };
      if (
        repair.damageId &&
        find("damages", repair.damageId).vehicleId !== v.id
      )
        fail("invalidLink");
      if (net > 0)
        save("costs", {
          id: id("KO"),
          vehicleId: v.id,
          repairId: repair.id,
          date: repair.date,
          category: "repair",
          supplier: repair.supplier,
          description: repair.description,
          net,
          tax,
          gross: money(net * (1 + tax / 100)),
          source: "external",
        });
      return save("repairs", repair);
    }
    if (action === "service.create") {
      need("services");
      requireInternal();
      const v = vehicle(p.vehicleId);
      const mileage = num(p.mileage, 0, v.mileage),
        nextKm = num(p.nextKm, mileage),
        nextDate = date(p.nextDate);
      const r = {
        id: id("SV"),
        vehicleId: v.id,
        kind: required(p.kind),
        description: required(p.description),
        date: date(p.date),
        mileage,
        nextKm,
        nextDate,
        workOrderId: p.workOrderId || "",
        supplier: String(p.supplier || ""),
        createdAt: now,
      };
      if (r.workOrderId && find("workOrders", r.workOrderId).vehicleId !== v.id)
        fail("invalidLink");
      save("vehicles", {
        ...v,
        ...(p.kind === "tires"
          ? { tireDate: r.date, tireType: p.tireType || "allSeason" }
          : p.kind === "inspection"
            ? { inspectionDue: nextDate }
            : {
                lastServiceDate: r.date,
                lastServiceKm: mileage,
                serviceKm: nextKm,
                serviceDue: nextDate,
              }),
      });
      return save("services", r);
    }
    if (action === "article.save") {
      need("articles");
      const old = p.id ? find("articles", p.id) : {};
      if (s.all("articles").some((a) => a.id !== p.id && a.sku === p.sku))
        fail("duplicateArticle");
      const r = {
        ...old,
        id: old.id || id("ART"),
        name: required(p.name),
        sku: required(p.sku),
        ean: String(p.ean || ""),
        manufacturer: String(p.manufacturer || ""),
        category: p.category || "other",
        unit: p.unit || "pcs",
        stock: old.stock || 0,
        reserved: old.reserved || 0,
        minimum: num(p.minimum || 0),
        location: required(p.location),
        salePrice: num(p.salePrice),
        tax: num(p.tax, 0, 100),
        costPrice: old.costPrice || 0,
      };
      if (finance(u)) r.costPrice = num(p.costPrice || 0);
      return save("articles", r);
    }
    if (action === "stock.move") {
      need("articles");
      const a = find("articles", p.articleId);
      if (!["return", "inventory", "reservation"].includes(p.type))
        fail("invalidStatus");
      const quantity =
        p.type === "reservation"
          ? num(p.quantity, -a.reserved, a.stock - a.reserved)
          : num(p.quantity, -a.stock + a.reserved);
      if (!quantity) fail("invalidNumber");
      const reason = required(p.reason);
      save("articles", {
        ...a,
        ...(p.type === "reservation"
          ? { reserved: money(a.reserved + quantity) }
          : { stock: money(a.stock + quantity) }),
      });
      return save("movements", {
        id: id("MOV"),
        articleId: a.id,
        quantity,
        type: p.type,
        reason,
        userId: u.id,
        at: now,
      });
    }
    if (action === "purchase.create") {
      need("purchases");
      if (!finance(u)) fail("forbidden", 403);
      const a = find("articles", p.articleId);
      return save("purchases", {
        id: id("BE"),
        articleId: a.id,
        supplier: required(p.supplier),
        quantity: num(p.quantity, 0.001),
        received: 0,
        unitCost: num(p.unitCost),
        tax: num(p.tax, 0, 100),
        invoiceNumber: String(p.invoiceNumber || ""),
        status: "ordered",
        date: date(p.date),
        paid: false,
      });
    }
    if (action === "purchase.receive") {
      need("purchases");
      if (!can(u, "articles", "edit")) fail("forbidden", 403);
      const r = find("purchases", p.id),
        a = find("articles", r.articleId),
        quantity = num(p.quantity, 0.001, r.quantity - r.received);
      save("articles", {
        ...a,
        stock: money(a.stock + quantity),
        costPrice: r.unitCost,
        priceHistory: [
          ...(a.priceHistory || []),
          { at: now, cost: r.unitCost, purchaseId: r.id },
        ],
      });
      save("movements", {
        id: id("MOV"),
        articleId: a.id,
        purchaseId: r.id,
        quantity,
        type: "purchase",
        at: now,
        userId: u.id,
      });
      return save("purchases", {
        ...r,
        received: money(r.received + quantity),
        status: r.received + quantity >= r.quantity ? "received" : "partial",
      });
    }
    if (action === "purchase.bill") {
      need("purchases");
      if (!finance(u)) fail("forbidden", 403);
      const r = find("purchases", p.id);
      return save("purchases", {
        ...r,
        invoiceNumber: required(p.invoiceNumber),
        invoiceDate: date(p.invoiceDate),
        paid: !!p.paid,
        paymentDate: p.paid ? date(p.paymentDate) : "",
      });
    }
    if (action === "cost.create") {
      need("costs");
      vehicle(p.vehicleId);
      const net = num(p.net),
        tax = num(p.tax, 0, 100);
      return save("costs", {
        id: id("KO"),
        vehicleId: p.vehicleId,
        date: date(p.date),
        category: required(p.category),
        supplier: required(p.supplier),
        description: required(p.description),
        net,
        tax,
        gross: money(net * (1 + tax / 100)),
        source: "manual",
      });
    }
    if (action === "invoice.create" || action === "invoice.monthly") {
      need("invoices");
      if (!finance(u)) fail("forbidden", 403);
      const company = s.get("settings", "company");
      if (!company.address || !company.taxId) fail("companyRequired");
      let customerId = p.customerId,
        vehicleId = "",
        lines = [],
        rentalId = "",
        workOrderId = "",
        billing = {};
      if (action === "invoice.monthly") {
        const r = find("rentals", p.rentalId);
        const period = closedPeriods(r, s.all("invoices"), day()).find(
          (x) => x.start === p.periodStart,
        );
        if (!period) fail("invalidPeriod");
        rentalId = r.id;
        customerId = r.customerId;
        vehicleId = r.vehicleId;
        billing = {
          billingKind: "monthly",
          periodStart: period.start,
          periodEnd: period.end,
        };
        lines = [
          {
            description: `${r.id} · ${period.start} - ${period.end} (exclusive)`,
            quantity: period.days,
            price: r.rate,
            tax: company.tax,
          },
        ];
      } else if (p.rentalId) {
        const r = find("rentals", p.rentalId);
        if (r.status !== "returned") fail("returnBeforeInvoice");
        if (
          s
            .all("invoices")
            .some(
              (i) =>
                i.rentalId === r.id &&
                i.status !== "cancelled" &&
                i.billingKind !== "monthly",
            )
        )
          fail("alreadyInvoiced");
        rentalId = r.id;
        customerId = r.customerId;
        vehicleId = r.vehicleId;
        lines = [
          {
            description: `${r.id} · ${find("vehicles", r.vehicleId).plate} · ${r.start} - ${r.end}`,
            quantity: days(r.start, r.end),
            price: r.rate,
            tax: company.tax,
          },
          {
            description: "extras",
            quantity: 1,
            price: r.extras,
            tax: company.tax,
          },
          {
            description: "extraKm",
            quantity: r.extraKm || 0,
            price: r.extraKmRate,
            tax: company.tax,
          },
          {
            description: "extraDays",
            quantity: r.extraDays || 0,
            price: r.rate,
            tax: company.tax,
          },
          ...["cleaning", "refuel", "other"].map((key) => ({
            description: key,
            quantity: 1,
            price: r[key] || 0,
            tax: company.tax,
          })),
        ].filter((l) => l.price && l.quantity);
        billing = { billingKind: "final" };
        for (const i of s
          .all("invoices")
          .filter(
            (i) =>
              i.rentalId === r.id &&
              i.status !== "cancelled" &&
              i.billingKind === "monthly",
          ))
          for (const l of i.lines)
            lines.push({
              description: `${i.number} · monthlyCredit`,
              quantity: l.quantity,
              price: -l.price,
              tax: l.tax,
            });
      } else if (p.workOrderId) {
        const w = find("workOrders", p.workOrderId);
        if (w.vehicleId || w.status !== "complete") fail("invalidStatus");
        if (
          s
            .all("invoices")
            .some((i) => i.workOrderId === w.id && i.status !== "cancelled")
        )
          fail("alreadyInvoiced");
        workOrderId = w.id;
        customerId = w.customerId;
        lines = [
          {
            description: w.description,
            quantity: w.hours,
            price: w.laborRate,
            tax: company.tax,
          },
          ...w.parts.map((a) => ({
            description: a.name,
            quantity: a.quantity,
            price: a.price,
            tax: a.tax,
          })),
        ].filter((l) => l.quantity);
      } else {
        if (!Array.isArray(p.lines) || !p.lines.length || p.lines.length > 100)
          fail("required");
        lines = p.lines.map((l) => {
          const a = l.articleId ? find("articles", l.articleId) : null;
          const quantity = num(l.quantity, 0.001),
            price = num(l.price);
          if (a) {
            if (a.stock - a.reserved < quantity) fail("insufficientStock");
            save("articles", { ...a, stock: money(a.stock - quantity) });
            save("movements", {
              id: id("MOV"),
              articleId: a.id,
              quantity: -quantity,
              type: "sale",
              at: now,
              userId: u.id,
            });
          }
          return {
            description: required(l.description),
            quantity,
            price,
            tax: num(l.tax, 0, 100),
            articleId: a?.id || "",
          };
        });
      }
      const customer = find("customers", customerId);
      if (!customer.address) fail("addressRequired");
      lines = lines.map((l) => ({
        ...l,
        net: money(l.quantity * l.price),
        vat: money((l.quantity * l.price * l.tax) / 100),
      }));
      const net = money(lines.reduce((a, l) => a + l.net, 0)),
        vat = money(lines.reduce((a, l) => a + l.vat, 0));
      const year = new Date().getFullYear(),
        prefix = `${company.invoicePrefix || "RE"}-${year}-`,
        number =
          prefix +
          String(
            s.all("invoices").filter((i) => i.number?.startsWith(prefix))
              .length + 1,
          ).padStart(5, "0");
      return save("invoices", {
        id: id("RE"),
        number,
        customerId,
        customer: { ...customer },
        company: { ...company },
        vehicleId,
        rentalId,
        workOrderId,
        ...billing,
        lines,
        net,
        vat,
        gross: money(net + vat),
        paid: 0,
        status: "issued",
        date: day(),
        due: date(p.due || day(14)),
        createdAt: now,
      });
    }
    if (action === "payment.create") {
      need("payments");
      const r = find("invoices", p.invoiceId);
      if (r.status === "cancelled") fail("invalidStatus");
      const amount = num(p.amount, 0.01, money(r.gross - r.paid));
      save("invoices", {
        ...r,
        paid: money(r.paid + amount),
        status: money(r.paid + amount) >= r.gross ? "paid" : "partial",
      });
      return save("payments", {
        id: id("PAY"),
        invoiceId: r.id,
        vehicleId: r.vehicleId,
        amount,
        method: p.method || "transfer",
        at: now,
        type: "invoice",
      });
    }
    if (action === "invoice.cancel") {
      need("invoices");
      if (u.role !== "admin") fail("forbidden", 403);
      const r = find("invoices", p.id);
      if (r.paid || r.status === "cancelled") fail("invalidStatus");
      if (
        r.billingKind === "monthly" &&
        s
          .all("invoices")
          .some(
            (i) =>
              i.rentalId === r.rentalId &&
              i.billingKind !== "monthly" &&
              i.status !== "cancelled",
          )
      )
        fail("invalidStatus");
      required(p.reason);
      for (const l of r.lines) {
        if (l.articleId) {
          const a = find("articles", l.articleId);
          save("articles", { ...a, stock: money(a.stock + l.quantity) });
          save("movements", {
            id: id("MOV"),
            articleId: a.id,
            quantity: l.quantity,
            type: "return",
            invoiceId: r.id,
            at: now,
            userId: u.id,
          });
        }
      }
      return save("invoices", {
        ...r,
        status: "cancelled",
        cancelReason: p.reason,
        cancelledAt: now,
      });
    }
    if (action === "document.create") {
      need("documents");
      requireInternal();
      const allowed = [
        "vehicles",
        "costs",
        "purchases",
        "invoices",
        "workOrders",
        "damages",
        "services",
        "repairs",
      ];
      if (!allowed.includes(p.ownerKind)) fail("invalidLink");
      const owner = find(p.ownerKind, p.ownerId);
      if (!can(u, p.ownerKind)) fail("forbidden", 403);
      const financial =
        !!p.financial ||
        ["costs", "purchases", "invoices"].includes(p.ownerKind) ||
        ["purchase", "leasing"].includes(p.type);
      if (financial && !finance(u)) fail("forbidden", 403);
      const file = fileData(p.file);
      return save("documents", {
        id: id("DOC"),
        ownerKind: p.ownerKind,
        ownerId: p.ownerId,
        vehicleId:
          p.ownerKind === "vehicles" ? owner.id : owner.vehicleId || "",
        type: required(p.type),
        title: required(p.title),
        date: date(p.date),
        expires: p.expires ? date(p.expires) : "",
        file,
        fileName: String(p.fileName || "document"),
        financial,
        shared: !!p.shared,
        createdAt: now,
      });
    }
    if (action === "message.send") {
      need("messages");
      vehicle(p.vehicleId);
      const r = s
        .all("rentals")
        .find((r) => r.vehicleId === p.vehicleId && r.status === "active");
      const channel = p.channel === "workshop" ? "workshop" : "clients";
      if (
        (channel === "workshop" && !internal(u)) ||
        (u.surface === "workshop" && channel !== "workshop")
      )
        fail("forbidden", 403);
      const attachments = (Array.isArray(p.attachments) ? p.attachments : [])
        .slice(0, 3)
        .map((a) => ({
          name: required(a.name).slice(0, 160),
          file: fileData(a.file),
        }));
      if (!String(p.body || "").trim() && !attachments.length) fail("required");
      return save("messages", {
        id: id("MSG"),
        vehicleId: p.vehicleId,
        rentalId: r?.id || "",
        customerId: r?.customerId || u.customerId || "",
        recipientId: r?.driverId || "",
        senderId: u.id,
        sender: u.name,
        body: String(p.body || "")
          .trim()
          .slice(0, 5000),
        channel,
        attachments,
        at: now,
      });
    }
    if (action === "location.report") {
      need("locations");
      const v = vehicle(p.vehicleId);
      return save("locations", {
        id: id("LOC"),
        vehicleId: v.id,
        latitude: num(p.latitude, -90, 90),
        longitude: num(p.longitude, -180, 180),
        accuracy: num(p.accuracy),
        at: now,
        source: "device",
        userId: u.id,
      });
    }
    if (action === "location.ingest") {
      if (u.role !== "admin") fail("forbidden", 403);
      const trackerId = required(p.trackerId),
        matches = s.all("vehicles").filter((v) => v.trackerId === trackerId);
      if (matches.length !== 1) fail("invalidTracker");
      const at = p.observedAt ? new Date(p.observedAt).toISOString() : now;
      if (Date.parse(at) > Date.now() + 60000) fail("invalidDate");
      return save("locations", {
        id: id("LOC"),
        vehicleId: matches[0].id,
        latitude: num(p.latitude, -90, 90),
        longitude: num(p.longitude, -180, 180),
        accuracy: num(p.accuracy || 0),
        at,
        receivedAt: now,
        source: "hardware",
        userId: u.id,
      });
    }
    if (action === "task.save") {
      need("tasks");
      const old = p.id ? find("tasks", p.id) : {};
      if (old.autoManaged) fail("autoTaskManaged");
      if (p.vehicleId) vehicle(p.vehicleId);
      return save("tasks", {
        ...old,
        id: old.id || id("TASK"),
        title: required(p.title),
        due: date(p.due),
        vehicleId: p.vehicleId || "",
        done: !!p.done,
        assignedTo: p.assignedTo || u.id,
      });
    }
    if (action === "settings.save") {
      need("settings");
      const r = { id: "company" };
      for (const k of [
        "name",
        "address",
        "email",
        "taxId",
        "iban",
        "terms",
        "invoicePrefix",
      ])
        r[k] = String(p[k] || "").slice(0, 20000);
      r.tax = num(p.tax, 0, 100);
      r.currency = "EUR";
      return save("settings", r);
    }
    if (action === "user.create") {
      need("users");
      if (!roles.includes(p.role)) fail("invalidRole");
      if (p.role === "client" || p.customerId) find("customers", p.customerId);
      if (String(p.password || "").length < 12) fail("passwordShort");
      const r = {
        id: id("U"),
        email: required(p.email).toLowerCase(),
        name: required(p.name),
        role: p.role,
        customerId: p.customerId || "",
      };
      if (s.db.prepare("SELECT id FROM users WHERE email=?").get(r.email))
        fail("duplicateUser");
      s.db
        .prepare(
          "INSERT INTO users(id,email,name,role,customerId,password) VALUES(?,?,?,?,?,?)",
        )
        .run(
          r.id,
          r.email,
          r.name,
          r.role,
          r.customerId,
          hashPassword(p.password),
        );
      s.audit(u.id, action, "users", r.id, null, r);
      return r;
    }
    if (action === "user.update") {
      need("users");
      if (p.id === u.id) fail("cannotEditSelf");
      const old = s.db
        .prepare(
          "SELECT id,email,name,role,customerId,access FROM users WHERE id=?",
        )
        .get(p.id);
      if (!old) fail("notFound", 404);
      if (!roles.includes(p.role)) fail("invalidRole");
      if (p.role === "client" || p.customerId) find("customers", p.customerId);
      const access = {};
      for (const [key, rule] of Object.entries(p.access || {})) {
        if (key === "apps") {
          access.apps = Object.fromEntries(
            ["board", "clients", "workshop"]
              .filter((k) => typeof rule?.[k] === "boolean")
              .map((k) => [k, rule[k]]),
          );
          continue;
        }
        if (key === "clientScope") {
          access.clientScope = { view: rule?.view === true };
          continue;
        }
        if (
          key !== "purchasePrices" &&
          !Object.values(permissions).some((ps) => ps.includes(key))
        )
          continue;
        if (!rule || typeof rule !== "object") fail("required");
        access[key] = {};
        for (const op of ["view", "create", "edit", "cancel", "export"])
          if (typeof rule[op] === "boolean") access[key][op] = rule[op];
      }
      const next = {
        ...old,
        name: required(p.name),
        role: p.role,
        customerId: p.customerId || "",
        access,
      };
      if (access.clientScope?.view) find("customers", next.customerId);
      s.db
        .prepare(
          "UPDATE users SET name=?,role=?,customerId=?,access=? WHERE id=?",
        )
        .run(
          next.name,
          next.role,
          next.customerId,
          JSON.stringify(access),
          p.id,
        );
      if (p.password) {
        if (String(p.password).length < 12) fail("passwordShort");
        s.db
          .prepare("UPDATE users SET password=? WHERE id=?")
          .run(hashPassword(p.password), p.id);
      }
      s.db.prepare("DELETE FROM sessions WHERE userId=?").run(p.id);
      s.audit(
        u.id,
        action,
        "users",
        p.id,
        { ...old, access: accessOf(old) },
        next,
      );
      return next;
    }
    fail("unknownAction");
  });
}
function imageData(v) {
  if (
    typeof v !== "string" ||
    !/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(v) ||
    v.length > 8_000_000
  )
    fail("invalidImage");
  return v;
}
function fileData(v) {
  if (
    typeof v !== "string" ||
    !/^data:(application\/pdf|image\/(png|jpeg|webp));base64,[a-zA-Z0-9+/=]+$/.test(
      v,
    ) ||
    v.length > 12_000_000
  )
    fail("invalidFile");
  return v;
}

export function authorizedMedia(s, u, kind, id, path) {
  if (
    !["vehicles", "damages", "documents", "rentals", "messages"].includes(
      kind,
    ) ||
    !/^((attachments\.\d+\.file)|(photos\.[a-zA-Z]+)|(photo|evidence|file)|((handover|return|contract)\.)?signature|((handover|return)\.(photos\.\d+|damages\.\d+\.(photo|evidence))))$/.test(
      path,
    )
  )
    fail("notFound", 404);
  if (!snapshot(s, u)[kind].some((r) => r.id === id)) fail("forbidden", 403);
  const raw = path.split(".").reduce((r, k) => r?.[k], s.get(kind, id));
  if (typeof raw !== "string" || !raw.startsWith("data:"))
    fail("notFound", 404);
  const match = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) fail("notFound", 404);
  return {
    type: match[1],
    buffer: Buffer.from(match[2], "base64"),
    name:
      kind === "documents"
        ? s.get(kind, id).fileName
        : kind === "messages"
          ? s.get(kind, id).attachments[Number(path.split(".")[1])]?.name
          : null,
  };
}

export function notificationsFor(s, u) {
  const reads = new Set(
    s
      .all("notificationReads")
      .filter((r) => r.userId === u.id)
      .map((r) => r.notificationId),
  );
  const ids = visibleVehicleIds(s, u);
  const items = s
    .all("notifications")
    .filter(
      (n) =>
        n.userId === u.id &&
        (!n.surface || !u.surface || n.surface === u.surface),
    );
  if (can(u, "vehicles"))
    for (const a of serviceAlerts(
      s.all("vehicles").filter((v) => ids.has(v.id)),
      can(u, "services") ? s.all("services") : [],
      day(),
    ))
      items.push({
        id: "due:" + a.id,
        title: a.kind,
        body: a.plate,
        vehicleId: a.vehicleId,
        view: "vehicles",
        at: a.due + "T08:00:00Z",
        severity: a.overdue ? "high" : "normal",
      });
  if (can(u, "articles"))
    for (const a of s
      .all("articles")
      .filter((a) => a.stock - a.reserved < a.minimum))
      items.push({
        id: `stock:${a.id}:${a.stock}`,
        title: "lowStock",
        body: a.name,
        view: "articles",
        at: day() + "T08:00:00Z",
        severity: "high",
      });
  return items
    .map((n) => ({ ...n, read: reads.has(n.id) }))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 150);
}

export function notifyChange(s, actor, action, record) {
  if (
    !record ||
    action.endsWith(".read") ||
    action.startsWith("location.") ||
    action.startsWith("user.")
  )
    return;
  const map = {
    message: "messages",
    damage: "damages",
    work: "workOrders",
    stock: "articles",
    purchase: "purchases",
    rental: "rentals",
    document: "documents",
    service: "services",
    repair: "repairs",
    invoice: "invoices",
    payment: "payments",
  };
  const view = map[action.split(".")[0]];
  if (!view) return;
  const users = s.db
    .prepare("SELECT id,name,role,customerId,access FROM users")
    .all();
  for (const base of users) {
    if (base.id === actor.id) continue;
    for (const surface of ["board", "clients", "workshop"]) {
      if (!appAccess(base)[surface]) continue;
      const u = surfaceUser(base, surface);
      if (!can(u, view)) continue;
      if (
        view === "documents" &&
        ((!internal(u) && !record.shared) || (record.financial && !finance(u)))
      )
        continue;
      if (record.vehicleId && !visibleVehicleIds(s, u).has(record.vehicleId))
        continue;
      if (view === "messages") {
        if (surface === "workshop" && record.channel !== "workshop") continue;
        if (
          surface === "clients" &&
          (record.channel === "workshop" ||
            !(
              record.recipientId === u.id ||
              (u.role === "client" && record.customerId === u.customerId)
            ))
        )
          continue;
      }
      if (surface === "clients" && record.rentalId) {
        const rental = s.get("rentals", record.rentalId);
        if (
          rental &&
          !(u.role === "client"
            ? rental.customerId === u.customerId
            : rental.driverId === u.id)
        )
          continue;
      }
      const n = {
        id: `N-${randomUUID()}`,
        userId: base.id,
        surface,
        title: view === "messages" ? "newMessage" : view,
        body: record.description || record.body || record.number || record.id,
        view,
        vehicleId: record.vehicleId || "",
        recordId: record.id,
        channel: record.channel,
        at: new Date().toISOString(),
        severity: "normal",
      };
      s.put("notifications", n);
    }
  }
}
