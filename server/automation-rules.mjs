const iso = (d) => d.toISOString().slice(0, 10);
export const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const dateDays = (a, b) =>
  Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86400000));
export function closedPeriods(r, invoices, today) {
  if (r.billingMode !== "monthly" || r.status !== "active") return [];
  if (
    invoices.some(
      (i) =>
        i.rentalId === r.id &&
        i.status !== "cancelled" &&
        i.billingKind !== "monthly",
    )
  )
    return [];
  const result = [];
  let cursor = r.start;
  for (let n = 0; cursor < r.end && n < 1200; n++) {
    const d = new Date(cursor + "T00:00:00Z");
    const boundary = iso(
      new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)),
    );
    if (boundary > today) break;
    const end = boundary < r.end ? boundary : r.end;
    if (
      !invoices.some(
        (i) =>
          i.rentalId === r.id &&
          i.billingKind === "monthly" &&
          i.periodStart === cursor &&
          i.periodEnd === end,
      )
    )
      result.push({
        id: `${r.id}:${cursor}`,
        rentalId: r.id,
        vehicleId: r.vehicleId,
        start: cursor,
        end,
        days: dateDays(cursor, end),
        net: round(dateDays(cursor, end) * r.rate),
      });
    cursor = boundary;
  }
  return result;
}
export function serviceAlerts(vehicles, services, today) {
  const result = [];
  for (const v of vehicles) {
    const plans = [
      { kind: "serviceDue", date: v.serviceDue, km: v.serviceKm },
      { kind: "inspectionDue", date: v.inspectionDue },
      { kind: "insuranceDue", date: v.insuranceDue },
    ];
    const latest = new Map();
    for (const s of services
      .filter((s) => s.vehicleId === v.id)
      .sort((a, b) => String(b.date).localeCompare(String(a.date))))
      if (!latest.has(s.kind)) latest.set(s.kind, s);
    for (const s of latest.values())
      if (!["inspection"].includes(s.kind))
        plans.push({ kind: s.kind, date: s.nextDate, km: s.nextKm });
    const seen = new Set();
    for (const p of plans) {
      const daysLeft = p.date
        ? Math.round((Date.parse(p.date) - Date.parse(today)) / 86400000)
        : null;
      const kmLeft = p.km > 0 ? p.km - v.mileage : null;
      if (
        !(
          (daysLeft !== null && daysLeft <= 14) ||
          (kmLeft !== null && kmLeft <= 1000)
        )
      )
        continue;
      const key = `${p.date || ""}:${p.km || 0}`;
      if (seen.has(key) && p.kind !== "insuranceDue") continue;
      seen.add(key);
      result.push({
        id: `${v.id}:${p.kind}:${key}`,
        vehicleId: v.id,
        plate: v.plate,
        kind: p.kind,
        due: p.date || today,
        daysLeft,
        kmLeft,
        overdue:
          (daysLeft !== null && daysLeft < 0) ||
          (kmLeft !== null && kmLeft <= 0),
      });
    }
  }
  return result.sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) || a.due.localeCompare(b.due),
  );
}
