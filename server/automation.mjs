import {
  execute,
  snapshot,
  can,
  DomainError,
  notifyChange,
} from "./domain.mjs";
import { closedPeriods, serviceAlerts, round } from "./automation-rules.mjs";
import { day } from "./seed.mjs";
const system = { id: "system:automation", role: "admin", surface: "board" };
export function automationState(s, u) {
  const data = snapshot(s, u),
    today = day();
  const billing = can(u, "invoices") && can(u, "finance") && can(u, "rentals");
  return {
    checkedAt: s.get("meta", "automation-status")?.checkedAt || null,
    serviceAlerts: can(u, "vehicles")
      ? serviceAlerts(data.vehicles, data.services, today)
      : [],
    pending: billing
      ? data.rentals.flatMap((r) => closedPeriods(r, data.invoices, today))
      : [],
    monthlyInvoices: billing
      ? data.invoices.filter((i) => i.billingKind === "monthly")
      : [],
    billingErrors: billing
      ? s.get("meta", "automation-status")?.errors || []
      : [],
    settings: can(u, "settings")
      ? s.get("settings", "automation") || { id: "automation", enabled: false }
      : null,
    balances: billing
      ? data.rentals
          .filter((r) => ["active", "returned"].includes(r.status))
          .map((r) => {
            const billed = data.invoices.filter(
              (i) => i.rentalId === r.id && i.status !== "cancelled",
            );
            return {
              id: r.id,
              vehicleId: r.vehicleId,
              billingMode: r.billingMode || "final",
              total: r.total,
              billed: round(billed.reduce((n, i) => n + i.net, 0)),
              remaining: round(r.total - billed.reduce((n, i) => n + i.net, 0)),
            };
          })
      : [],
  };
}
export function configureAutomation(s, u, p) {
  if (
    u.surface !== "board" ||
    u.role !== "admin" ||
    !can(u, "settings", "edit")
  )
    throw new DomainError("forbidden", 403);
  if (typeof p.enabled !== "boolean") throw new DomainError("required");
  return s.transaction(() =>
    s.save(
      u,
      "settings",
      { id: "automation", enabled: p.enabled },
      "automation.configure",
    ),
  );
}
export function runAutomation(s) {
  const today = day(),
    now = new Date().toISOString(),
    errors = [];
  let changed = false;
  const alerts = serviceAlerts(s.all("vehicles"), s.all("services"), today);
  const active = new Set(alerts.map((a) => "auto:" + a.id));
  s.transaction(() => {
    for (const a of alerts) {
      const id = "auto:" + a.id,
        old = s.get("tasks", id);
      const value = {
        id,
        vehicleId: a.vehicleId,
        title: `${a.plate} · ${a.kind}`,
        due: a.due,
        done: false,
        autoManaged: true,
        serviceKind: a.kind,
        priority: a.overdue ? "high" : "normal",
      };
      if (!old || old.done || old.priority !== value.priority) {
        s.save(system, "tasks", value, "automation.service");
        changed = true;
      }
    }
    for (const task of s
      .all("tasks")
      .filter((t) => t.autoManaged && !t.done && !active.has(t.id))) {
      s.save(system, "tasks", { ...task, done: true }, "automation.resolve");
      changed = true;
    }
  });
  if (s.get("settings", "automation")?.enabled) {
    for (const r of s.all("rentals"))
      for (const p of closedPeriods(r, s.all("invoices"), today)) {
        try {
          const invoice = execute(s, system, "invoice.monthly", {
            rentalId: r.id,
            periodStart: p.start,
          });
          notifyChange(s, system, "invoice.create", invoice);
          changed = true;
        } catch (e) {
          errors.push({
            rentalId: r.id,
            periodStart: p.start,
            error: e instanceof DomainError ? e.message : "serverError",
          });
        }
      }
  }
  s.put("meta", { id: "automation-status", checkedAt: now, errors });
  return changed;
}
