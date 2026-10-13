import { useEffect, useRef, useState } from "react";
import { FleetMap } from "./Collaboration";
import {
  Car,
  ArrowUpRight,
  AlertTriangle,
  Plus,
  Download,
  ChevronDown,
  Package,
  Wrench,
  CalendarDays,
  CircleDollarSign,
  MapPin,
  Send,
  Check,
  ShieldCheck,
  FileText,
  ChevronLeft,
  ChevronRight,
  Printer,
  PenLine,
  ClipboardCheck,
} from "lucide-react";
import { useApp } from "./core";
import { useI18n } from "./i18n";
import {
  Section,
  Stat,
  Badge,
  Table,
  Empty,
  VehiclePhoto,
  AddButton,
  Fields,
  SubmitForm,
  IconButton,
  type Column,
} from "./ui";
import {
  currency,
  dateText,
  days,
  due,
  sum,
  today,
  future,
  locale,
  monthText,
  localDate,
  downloadCsv,
} from "./utils";
import type { RecordData, View } from "./types";

export function Dashboard() {
  const { data, can, go, open, selectVehicle } = useApp(),
    { t, lang } = useI18n();
  const [period, setPeriod] = useState("month");
  const start =
    period === "month"
      ? today().slice(0, 7) + "-01"
      : period === "year"
        ? today().slice(0, 4) + "-01-01"
        : "0000-01-01";
  const invoices = data.invoices.filter(
      (i) => i.status !== "cancelled" && i.date >= start,
    ),
    costs = data.costs.filter((c) => c.date >= start),
    revenue = sum(invoices, "net"),
    expenses = sum(costs, "net");
  const alerts = [
    ...data.vehicles.flatMap((v) =>
      ["inspectionDue", "insuranceDue", "serviceDue"]
        .filter((k) => due(v[k]) <= 30)
        .map((k) => ({
          id: v.id + k,
          title: `${v.plate} · ${t(k)}`,
          detail: dateText(v[k], lang),
          bad: due(v[k]) < 0,
          click: () => selectVehicle(v.id),
        })),
    ),
    ...data.vehicles
      .filter((v) => v.serviceKm > 0 && v.mileage >= v.serviceKm)
      .map((v) => ({
        id: v.id + "km",
        title: `${v.plate} · ${t("serviceKm")}`,
        detail: `${v.serviceKm} km`,
        bad: true,
        click: () => selectVehicle(v.id),
      })),
    ...data.articles
      .filter((a) => a.stock - a.reserved < a.minimum)
      .map((a) => ({
        id: a.id,
        title: `${a.name} · ${t("lowStock")}`,
        detail: `${a.stock - a.reserved} ${t(a.unit)}`,
        bad: true,
        click: () => go("articles", "lowStock"),
      })),
    ...data.invoices
      .filter(
        (i) => i.status !== "cancelled" && i.paid < i.gross && due(i.due) < 0,
      )
      .map((i) => ({
        id: i.id,
        title: `${i.number} · ${t("overdue")}`,
        detail: currency(i.gross - i.paid, lang),
        bad: true,
        click: () =>
          open({
            kind: "record",
            record: i,
            extra: { collection: "invoices" },
          }),
      })),
    ...data.workOrders
      .filter(
        (w) => w.status !== "complete" && due(w.createdAt?.slice(0, 10)) < -7,
      )
      .map((w) => ({
        id: w.id,
        title: `${w.id} · ${t("workOrders")}`,
        detail: dateText(w.createdAt, lang),
        bad: true,
        click: () =>
          open({
            kind: "record",
            record: w,
            extra: { collection: "workOrders" },
          }),
      })),
    ...data.documents
      .filter((d) => d.expires && due(d.expires) <= 30)
      .map((d) => ({
        id: d.id,
        title: d.title,
        detail: dateText(d.expires, lang),
        bad: due(d.expires) < 0,
        click: () => go("documents"),
      })),
    ...data.rentals
      .filter(
        (r) => r.status === "returned" && r.depositHeld > 0 && can("payments"),
      )
      .map((r) => ({
        id: r.id + "deposit",
        title: `${r.id} · ${t("deposits")}`,
        detail: currency(r.depositHeld, lang),
        bad: true,
        click: () => open({ kind: "deposit", record: r }),
      })),
  ];
  const schedule = data.rentals.filter(
    (r) =>
      (r.start === today() && r.status === "reserved") ||
      (r.end <= today() && r.status === "active"),
  );
  return (
    <>
      <div className="page-heading dashboard-heading">
        <div>
          <div className="eyebrow">S&S FAHRZEUGVERLEIH</div>
          <h1>
            {t("welcome")}, {data.user.name.split(" ")[0]}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {dateText(today(), lang)}{" "}
            <span className="subtle-separator">/</span> {t(data.user.role)}
          </p>
        </div>
        <div className="heading-actions">
          <div className="dashboard-period">
            <select
              aria-label={t("period")}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              {["month", "year", "allTime"].map((k) => (
                <option key={k} value={k}>
                  {t(k)}
                </option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </div>
          {["admin", "employee"].includes(data.user.role) && (
            <AddButton
              label={t("newRental")}
              onClick={() => open({ kind: "rental" })}
            />
          )}
        </div>
      </div>
      <div className="stats-grid">
        <Stat
          label={t("totalVehicles")}
          value={data.vehicles.length}
          icon={<Car size={19} />}
          onClick={() => go("vehicles")}
        />
        {["available", "rented", "reserved", "maintenance"].map((k, i) => (
          <Stat
            key={k}
            label={t(k)}
            value={data.vehicles.filter((v) => v.status === k).length}
            tone={["green", "blue", "amber", "red"][i]}
            icon={i === 3 ? <Wrench size={18} /> : undefined}
            onClick={() => go("vehicles", k)}
          />
        ))}
      </div>
      {can("finance") && (
        <div className="financial-strip">
          {[
            ["revenue", revenue, "invoices"],
            ["expenses", expenses, "costs"],
            ["result", revenue - expenses, "reports"],
            ["deposits", sum(data.rentals, "depositHeld"), "payments"],
          ].map(([label, value, view]) => (
            <button key={String(label)} onClick={() => go(view as View)}>
              <span>{t(String(label))}</span>
              <strong>{currency(Number(value), lang)}</strong>
              <ArrowUpRight size={15} />
            </button>
          ))}
        </div>
      )}
      <div className="dashboard-top">
        <Section
          title={t("schedule")}
          action={
            <button className="text-button" onClick={() => go("calendar")}>
              {t("calendar")}
              <ArrowUpRight size={14} />
            </button>
          }
        >
          {schedule.length ? (
            schedule.map((r) => {
              const v = data.vehicles.find((v) => v.id === r.vehicleId);
              return (
                <button
                  className="schedule-row"
                  key={r.id}
                  onClick={() =>
                    open({
                      kind: "record",
                      record: r,
                      extra: { collection: "rentals" },
                    })
                  }
                >
                  <span
                    className={`schedule-icon ${r.status === "active" ? "amber" : "green"}`}
                  >
                    <Car size={19} />
                  </span>
                  <div>
                    <strong>
                      {v?.make} {v?.model}
                    </strong>
                    <small>
                      {v?.plate} ·{" "}
                      {data.customers.find((c) => c.id === r.customerId)
                        ?.name || data.user.name}
                    </small>
                  </div>
                  <span
                    className={`tag ${r.status === "active" ? "amber" : "green"}`}
                  >
                    {t(r.status === "active" ? "return" : "handover")}
                  </span>
                </button>
              );
            })
          ) : (
            <Empty />
          )}
        </Section>
        <Section
          title={t("alerts")}
          action={<span className="count red">{alerts.length}</span>}
        >
          <div className="alert-list" tabIndex={0}>
            {alerts.length ? (
              alerts.map((a) => (
                <button
                  className={`alert-row ${a.bad ? "critical" : ""}`}
                  key={a.id}
                  onClick={a.click}
                >
                  <AlertTriangle size={15} />
                  <span>
                    {a.title}
                    <small>{a.detail}</small>
                  </span>
                  <ChevronRight size={14} />
                </button>
              ))
            ) : (
              <Empty />
            )}
          </div>
        </Section>
      </div>
      <div className="dashboard-bottom">
        {can("finance") && (
          <Section
            title={`${t("revenue")} / ${t("expenses")}`}
            action={
              <button className="text-button" onClick={() => go("reports")}>
                <ArrowUpRight size={16} />
              </button>
            }
          >
            <MonthChart />
          </Section>
        )}
        <Section
          title={t("fleetStatus")}
          action={
            <button className="text-button" onClick={() => go("vehicles")}>
              {t("viewAll")}
              <ArrowUpRight size={14} />
            </button>
          }
        >
          <div className="mini-fleet">
            {data.vehicles.slice(0, 5).map((v) => (
              <button key={v.id} onClick={() => selectVehicle(v.id)}>
                <VehiclePhoto vehicle={v} />
                <div>
                  <strong>
                    {v.make} {v.model}
                  </strong>
                  <small>{v.plate}</small>
                </div>
                <Badge value={v.status} />
              </button>
            ))}
          </div>
        </Section>
        {can("workOrders") ? (
          <Section
            title={t("workOrders")}
            action={
              <button className="text-button" onClick={() => go("workOrders")}>
                <ArrowUpRight size={16} />
              </button>
            }
          >
            {data.workOrders
              .filter((w) => w.status !== "complete")
              .slice(0, 4)
              .map((w) => (
                <button
                  className="work-row"
                  key={w.id}
                  onClick={() =>
                    open({
                      kind: "record",
                      record: w,
                      extra: { collection: "workOrders" },
                    })
                  }
                >
                  <span className="mini-icon">
                    <Wrench size={16} />
                  </span>
                  <div>
                    <strong>{w.description}</strong>
                    <small>
                      {data.vehicles.find((v) => v.id === w.vehicleId)?.plate ||
                        t("external")}{" "}
                      · {w.id}
                    </small>
                    <Badge value={w.status} />
                  </div>
                </button>
              ))}
            <button
              className="button full-width"
              onClick={() => open({ kind: "work" })}
            >
              <Plus size={15} />
              {t("newWork")}
            </button>
          </Section>
        ) : (
          <Section title={t("nextAppointments")}>
            {data.rentals
              .filter((r) => r.status === "reserved")
              .slice(0, 4)
              .map((r) => (
                <button
                  className="schedule-row"
                  key={r.id}
                  onClick={() =>
                    open({
                      kind: "record",
                      record: r,
                      extra: { collection: "rentals" },
                    })
                  }
                >
                  <CalendarDays size={18} />
                  <div>
                    <strong>
                      {data.vehicles.find((v) => v.id === r.vehicleId)?.plate}
                    </strong>
                    <small>{dateText(r.start, lang)}</small>
                  </div>
                </button>
              ))}
          </Section>
        )}
      </div>
      {can("audit") && (
        <Section
          title={t("recentActivity")}
          action={
            <button className="text-button" onClick={() => go("users")}>
              {t("audit")}
              <ArrowUpRight size={14} />
            </button>
          }
        >
          <Table
            rows={data.audit.slice(0, 5)}
            columns={[
              {
                key: "time",
                label: t("date"),
                render: (r) => dateText(r.time, lang, true),
              },
              {
                key: "userId",
                label: t("user"),
                render: (r) =>
                  data.users.find((u) => u.id === r.userId)?.name || r.userId,
              },
              { key: "kind", label: t("type"), render: (r) => t(r.kind) },
              { key: "recordId", label: t("linkedRecord") },
            ]}
            onRow={(r) => open({ kind: "auditDetail", record: r })}
          />
        </Section>
      )}
    </>
  );
}

export function PortalDashboard() {
  const { data, go, selectVehicle } = useApp(),
    { t, lang } = useI18n();
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">S&S FAHRZEUGVERLEIH</div>
          <h1>
            {t("welcome")}, {data.user.name.split(" ")[0]}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {dateText(today(), lang)} · {t(data.user.role)}
          </p>
        </div>
        <Badge value={data.user.role} />
      </div>
      <div className="portal-actions">
        <button className="button primary" onClick={() => go("locations")}>
          <MapPin size={18} />
          {t("shareLocation")}
        </button>
        <button className="button" onClick={() => go("messages")}>
          <Send size={17} />
          {t("messages")}
        </button>
      </div>
      <Section title={`${t("vehicles")} · ${data.vehicles.length}`}>
        <div className="portal-fleet">
          {data.vehicles.map((v) => (
            <article className="portal-vehicle" key={v.id}>
              <button
                className="portal-photo"
                onClick={() => selectVehicle(v.id)}
              >
                <VehiclePhoto vehicle={v} large />
              </button>
              <div className="portal-vehicle-body">
                <div className="section-head">
                  <span className="plate">{v.plate}</span>
                  <Badge value={v.status} />
                </div>
                <h2>
                  {v.make} {v.model}
                </h2>
                <p>
                  {v.mileage.toLocaleString(locale(lang))} km · {v.year}
                </p>
                <div className="actions">
                  <button
                    className="button"
                    onClick={() => selectVehicle(v.id)}
                  >
                    <Car size={17} />
                    {t("overview")}
                  </button>
                  <button
                    className="button"
                    onClick={() => selectVehicle(v.id, "damages")}
                  >
                    <AlertTriangle size={16} />
                    {t("newDamage")}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
        {!data.vehicles.length && <Empty />}
      </Section>
      {data.user.role === "client" && (
        <Section title={t("rentals")}>
          <CollectionView view="rentals" />
        </Section>
      )}
    </>
  );
}

function MonthChart() {
  const { data, go } = useApp(),
    { t, lang } = useI18n();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 5 + i);
    const key = localDate(d).slice(0, 7);
    return {
      key,
      label: monthText(d, lang, true),
      revenue: sum(
        data.invoices.filter(
          (r) => r.date.startsWith(key) && r.status !== "cancelled",
        ),
        "net",
      ),
      cost: sum(
        data.costs.filter((r) => r.date.startsWith(key)),
        "net",
      ),
    };
  });
  const max = Math.max(1, ...months.flatMap((m) => [m.revenue, m.cost]));
  return (
    <>
      <div className="chart-legend">
        <span>
          <i className="blue" />
          {t("revenue")}
        </span>
        <span>
          <i className="red" />
          {t("expenses")}
        </span>
      </div>
      <div className="bar-chart">
        {months.map((m) => (
          <div className="bar-month" key={m.key}>
            <div className="bar-pair">
              <button
                title={`${t("revenue")}: ${currency(m.revenue, lang)}`}
                aria-label={`${m.label} ${t("revenue")} ${currency(m.revenue, lang)}`}
                className="bar revenue"
                style={{ height: `${Math.max(1, (m.revenue / max) * 100)}%` }}
                onClick={() => go("invoices", m.key)}
              />
              <button
                title={`${t("expenses")}: ${currency(m.cost, lang)}`}
                aria-label={`${m.label} ${t("expenses")} ${currency(m.cost, lang)}`}
                className="bar expense"
                style={{ height: `${Math.max(1, (m.cost / max) * 100)}%` }}
                onClick={() => go("costs", m.key)}
              />
            </div>
            <span>{m.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export function Fleet({ filter = "" }: { filter?: string }) {
  const { data, open, can, selectVehicle } = useApp(),
    { t, lang } = useI18n();
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(filter),
    [type, setType] = useState("");
  useEffect(() => setStatus(filter), [filter]);
  const rows = data.vehicles.filter(
    (v) =>
      (!status || v.status === status) &&
      (!type || v.type === type) &&
      `${v.plate} ${v.vin} ${v.make} ${v.model} ${v.location}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">S&S FAHRZEUGVERLEIH</div>
          <h1>
            {t("vehicles")}{" "}
            <span className="heading-count">{data.vehicles.length}</span>
          </h1>
        </div>
        <div className="actions">
          {can("export") && (
            <IconButton
              label={t("export")}
              onClick={() =>
                downloadCsv("vehicles", rows, [
                  "id",
                  "make",
                  "model",
                  "plate",
                  "vin",
                  "year",
                  "type",
                  "mileage",
                  "status",
                  "location",
                  "inspectionDue",
                ])
              }
            >
              <Download size={16} />
            </IconButton>
          )}
          {["admin", "employee"].includes(data.user.role) && (
            <AddButton
              label={t("newVehicle")}
              onClick={() => open({ kind: "vehicle" })}
            />
          )}
        </div>
      </div>
      <div className="filters">
        <input
          aria-label={t("search")}
          placeholder={t("search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label={t("status")}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">
            {t("all")} · {t("status")}
          </option>
          {[
            "available",
            "rented",
            "reserved",
            "maintenance",
            "inspection",
            "blocked",
          ].map((k) => (
            <option key={k} value={k}>
              {t(k)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("type")}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">
            {t("all")} · {t("type")}
          </option>
          {[...new Set(data.vehicles.map((v) => v.type))].map((k) => (
            <option key={k} value={k}>
              {t(k)}
            </option>
          ))}
        </select>
      </div>
      <Table
        rows={rows}
        onRow={(v) => selectVehicle(v.id)}
        columns={[
          {
            key: "vehicle",
            label: t("vehicle"),
            render: (r) => (
              <div className="vehicle-cell">
                <VehiclePhoto vehicle={r as any} />
                <div>
                  <strong>
                    {r.make} {r.model}
                  </strong>
                  <small>
                    {r.year} · {t(r.type)}
                  </small>
                </div>
              </div>
            ),
          },
          {
            key: "plate",
            label: t("plate"),
            render: (r) => <span className="plate">{r.plate}</span>,
          },
          {
            key: "status",
            label: t("status"),
            render: (r) => <Badge value={r.status} />,
          },
          {
            key: "customer",
            label: t("customer"),
            render: (v) => {
              const r = data.rentals.find(
                (r) => r.vehicleId === v.id && r.status === "active",
              );
              return r ? (
                <div>
                  {data.customers.find((c) => c.id === r.customerId)?.name ||
                    data.user.name}
                  <small>{r.id}</small>
                </div>
              ) : (
                "—"
              );
            },
          },
          {
            key: "mileage",
            label: t("mileage"),
            render: (r) => r.mileage.toLocaleString(locale(lang)) + " km",
          },
          { key: "location", label: t("location") },
          {
            key: "inspectionDue",
            label: t("inspectionDue"),
            render: (r) => (
              <span
                className={due(r.inspectionDue) <= 30 ? "warning-text" : ""}
              >
                {dateText(r.inspectionDue, lang)}
              </span>
            ),
          },
        ]}
      />
    </>
  );
}

const createKinds: Partial<Record<View, string>> = {
  repairs: "repair",
  rentals: "rental",
  customers: "customer",
  services: "service",
  workOrders: "work",
  articles: "article",
  purchases: "purchase",
  invoices: "invoice",
  costs: "cost",
  documents: "document",
};
const createLabels: Partial<Record<View, string>> = {
  repairs: "newRepair",
  rentals: "newRental",
  customers: "newCustomer",
  services: "newService",
  workOrders: "newWork",
  articles: "newArticle",
  purchases: "newPurchase",
  invoices: "newInvoice",
  costs: "newCost",
  documents: "newDocument",
};
export function CollectionView({
  view,
  vehicleId,
  filter = "",
}: {
  view: View;
  vehicleId?: string;
  filter?: string;
}) {
  const { data, open, can } = useApp(),
    { t, lang } = useI18n();
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const vName = (r: RecordData) =>
    data.vehicles.find((v) => v.id === r.vehicleId)?.plate || "—";
  const cName = (r: RecordData) =>
    data.customers.find((c) => c.id === r.customerId)?.name ||
    r.customer?.name ||
    "—";
  const moneyCol = (key: string, label = key): Column => ({
    key,
    label: t(label),
    render: (r) => currency(r[key], lang),
  });
  const textCol = (key: string, label = key): Column => ({
    key,
    label: t(label),
  });
  const dateCol = (key: string, label = key): Column => ({
    key,
    label: t(label),
    render: (r) => dateText(r[key], lang),
  });
  const statusCol: Column = {
    key: "status",
    label: t("status"),
    render: (r) => <Badge value={r.status} />,
  };
  const vehicleCol: Column = {
    key: "vehicleId",
    label: t("vehicle"),
    render: vName,
  };
  let rows: RecordData[] = [
      ...((data as unknown as Record<string, RecordData[]>)[view] || []),
    ],
    columns: Column[] = [];
  switch (view) {
    case "rentals":
      columns = [
        textCol("id", "contract"),
        vehicleCol,
        { key: "customerId", label: t("customer"), render: cName },
        dateCol("start"),
        dateCol("end"),
        moneyCol("total", "net"),
        moneyCol("depositHeld"),
        statusCol,
      ];
      break;
    case "customers":
      columns = [
        textCol("name"),
        textCol("company"),
        textCol("email"),
        textCol("phone"),
        textCol("address"),
      ];
      break;
    case "damages":
      columns = [
        textCol("id", "damages"),
        vehicleCol,
        textCol("description"),
        dateCol("createdAt", "reported"),
        statusCol,
        ...(can("finance") ? [moneyCol("repairCost")] : []),
      ];
      break;
    case "repairs":
      columns = [
        textCol("id", "repairs"),
        vehicleCol,
        textCol("description"),
        { key: "type", label: t("type"), render: (r) => t(r.type) },
        textCol("supplier"),
        dateCol("date"),
        textCol("mileage"),
        ...(can("finance") ? [moneyCol("net")] : []),
      ];
      break;
    case "services":
      columns = [
        textCol("id", "service"),
        vehicleCol,
        { key: "kind", label: t("kind"), render: (r) => t(r.kind) },
        textCol("description"),
        dateCol("date"),
        textCol("mileage"),
        dateCol("nextDate"),
        textCol("nextKm"),
      ];
      break;
    case "workOrders":
      columns = [
        textCol("id", "workOrders"),
        vehicleCol,
        textCol("description"),
        dateCol("due"),
        {
          key: "assignedTo",
          label: t("assignedTo"),
          render: (r) =>
            data.users.find((u) => u.id === r.assignedTo)?.name || "—",
        },
        textCol("hours"),
        statusCol,
      ];
      break;
    case "articles":
      columns = [
        textCol("name"),
        textCol("sku"),
        textCol("manufacturer"),
        {
          key: "stock",
          label: t("stock"),
          render: (r) => (
            <strong
              className={r.stock - r.reserved < r.minimum ? "warning-text" : ""}
            >
              {r.stock} {t(r.unit)}
            </strong>
          ),
        },
        textCol("reserved"),
        {
          key: "available",
          label: t("available"),
          render: (r) => r.stock - r.reserved,
        },
        textCol("minimum"),
        textCol("location"),
        moneyCol("salePrice"),
        ...(can("purchasePrices") ? [moneyCol("costPrice")] : []),
        {
          key: "actions",
          label: t("actions"),
          render: (r) =>
            can("articles:edit") ? (
              <div className="row-actions">
                <IconButton
                  label={t("edit")}
                  onClick={() => open({ kind: "article", record: r })}
                >
                  <PenLine size={15} />
                </IconButton>
                <IconButton
                  label={t("stockMove")}
                  onClick={() => open({ kind: "stock", record: r })}
                >
                  <Package size={15} />
                </IconButton>
              </div>
            ) : null,
        },
      ];
      break;
    case "purchases":
      columns = [
        textCol("id", "purchases"),
        textCol("supplier"),
        {
          key: "articleId",
          label: t("article"),
          render: (r) => data.articles.find((a) => a.id === r.articleId)?.name,
        },
        textCol("quantity"),
        textCol("received"),
        ...(can("purchasePrices") ? [moneyCol("unitCost")] : []),
        statusCol,
        {
          key: "actions",
          label: t("actions"),
          render: (r) =>
            r.status !== "received" &&
            can("purchases:edit") &&
            can("articles:edit") ? (
              <button
                className="button small"
                onClick={() => open({ kind: "receive", record: r })}
              >
                {t("receive")}
              </button>
            ) : null,
        },
      ];
      break;
    case "invoices":
      columns = [
        textCol("number", "invoiceNumber"),
        { key: "customerId", label: t("customer"), render: cName },
        dateCol("date"),
        dateCol("due"),
        moneyCol("net"),
        moneyCol("gross"),
        moneyCol("paid", "paidAmount"),
        statusCol,
      ];
      break;
    case "costs":
      columns = [
        textCol("id", "costs"),
        vehicleCol,
        dateCol("date"),
        { key: "category", label: t("category"), render: (r) => t(r.category) },
        textCol("supplier"),
        textCol("description"),
        moneyCol("net"),
        moneyCol("gross"),
      ];
      break;
    case "documents":
      columns = [
        textCol("title"),
        vehicleCol,
        { key: "type", label: t("type"), render: (r) => t(r.type) },
        dateCol("date"),
        dateCol("expires"),
        {
          key: "financial",
          label: t("financial"),
          render: (r) => (r.financial ? <ShieldCheck size={16} /> : null),
        },
        {
          key: "file",
          label: t("download"),
          render: (r) => (
            <a
              className="icon-button"
              href={r.file}
              download={r.fileName}
              title={t("download")}
            >
              <Download size={16} />
            </a>
          ),
        },
      ];
      break;
  }
  rows = rows.filter(
    (r) =>
      (!vehicleId || r.vehicleId === vehicleId) &&
      (!status || r.status === status) &&
      (!from ||
        (r.date || r.start || r.createdAt || "").slice(0, 10) >= from) &&
      (!to || (r.date || r.start || r.createdAt || "").slice(0, 10) <= to) &&
      (!filter ||
        (filter === "lowStock"
          ? r.stock - r.reserved < r.minimum
          : filter === "outstanding"
            ? r.status !== "cancelled" && r.paid < r.gross
            : filter.match(/^\d{4}-\d{2}$/)
              ? (r.date || "").startsWith(filter)
              : r.status === filter)) &&
      [
        r.id,
        r.number,
        r.name,
        r.description,
        r.title,
        r.sku,
        r.email,
        r.supplier,
        vName(r),
        cName(r),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const createAllowed =
    createKinds[view] &&
    can(`${view}:create`) &&
    !["client", "driver"].includes(data.user.role) &&
    !(view === "rentals" && !["admin", "employee"].includes(data.user.role)) &&
    !(view === "purchases" && !can("finance"));
  const select = (r: RecordData) => {
    if (view === "customers") open({ kind: "customer", record: r });
    else open({ kind: "record", record: r, extra: { collection: view } });
  };
  return (
    <>
      <div className={vehicleId ? "collection-heading" : "page-heading"}>
        <h1>
          {t(view)} <span className="heading-count">{rows.length}</span>
        </h1>
        <div className="actions">
          {can("export") && can(`${view}:export`) && (
            <IconButton
              label={t("export")}
              onClick={() =>
                downloadCsv(
                  view,
                  rows,
                  columns
                    .filter((c) => !["actions", "file"].includes(c.key))
                    .map((c) => c.key),
                )
              }
            >
              <Download size={17} />
            </IconButton>
          )}
          {createAllowed && (
            <AddButton
              label={t(createLabels[view]!)}
              onClick={() => open({ kind: createKinds[view]!, vehicleId })}
            />
          )}
        </div>
      </div>
      {!vehicleId && (
        <div className="collection-summary">
          <div>
            <span>{t("totalRecords")}</span>
            <strong>{((data as any)[view] || []).length}</strong>
          </div>
          <div>
            <span>{t("shown")}</span>
            <strong>{rows.length}</strong>
          </div>
          <div>
            <span>{t(view === "articles" ? "lowStock" : "openItems")}</span>
            <strong>
              {
                rows.filter((r) =>
                  view === "articles"
                    ? r.stock - r.reserved < r.minimum
                    : r.status &&
                      ![
                        "complete",
                        "closed",
                        "paid",
                        "returned",
                        "cancelled",
                        "received",
                      ].includes(r.status),
                ).length
              }
            </strong>
          </div>
          <div>
            <span>{t("access")}</span>
            <strong className="summary-label">
              {t(can(`${view}:edit`) ? "edit" : "readOnly")}
            </strong>
          </div>
        </div>
      )}
      <div className="filters">
        <input
          aria-label={t("search")}
          placeholder={t("search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {rows.some((r) => r.status) || status ? (
          <select
            aria-label={t("status")}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">
              {t("all")} · {t("status")}
            </option>
            {[
              ...new Set(
                ((data as any)[view] as RecordData[])
                  .map((r) => r.status)
                  .filter(Boolean),
              ),
            ].map((k) => (
              <option value={k} key={k}>
                {t(k)}
              </option>
            ))}
          </select>
        ) : null}
        {!["customers", "articles"].includes(view) && (
          <>
            <input
              type="date"
              aria-label={t("from")}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <input
              type="date"
              aria-label={t("to")}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </>
        )}
      </div>
      <Table
        rows={rows}
        columns={columns}
        onRow={view === "documents" ? undefined : select}
      />
      {view === "articles" && (
        <Section title={t("movements")}>
          <Table
            rows={[...data.movements].reverse()}
            columns={[
              dateCol("at", "date"),
              {
                key: "articleId",
                label: t("article"),
                render: (r) =>
                  data.articles.find((a) => a.id === r.articleId)?.name,
              },
              { key: "type", label: t("type"), render: (r) => t(r.type) },
              textCol("quantity"),
              {
                key: "userId",
                label: t("user"),
                render: (r) =>
                  data.users.find((u) => u.id === r.userId)?.name || r.userId,
              },
              textCol("workOrderId", "linkedRecord"),
            ]}
          />
        </Section>
      )}
    </>
  );
}

export function Payments() {
  const { data, open } = useApp(),
    { t, lang } = useI18n();
  return (
    <>
      <div className="page-heading">
        <h1>{t("payments")}</h1>
      </div>
      <div className="stats-grid three">
        <Stat
          label={t("deposits")}
          value={currency(sum(data.rentals, "depositHeld"), lang)}
          tone="amber"
        />
        <Stat
          label={t("paidAmount")}
          value={currency(
            sum(
              data.payments.filter((p) => p.type === "invoice"),
              "amount",
            ),
            lang,
          )}
          tone="green"
        />
        <Stat
          label={t("outstanding")}
          value={currency(
            data.invoices
              .filter((i) => i.status !== "cancelled")
              .reduce((s, i) => s + i.gross - i.paid, 0),
            lang,
          )}
        />
      </div>
      <Section title={t("deposits")}>
        <Table
          rows={data.rentals.filter(
            (r) => r.depositHeld > 0 || r.depositSettledAt,
          )}
          columns={[
            { key: "id", label: t("contract") },
            {
              key: "deposit",
              label: t("deposit"),
              render: (r) => currency(r.deposit, lang),
            },
            {
              key: "depositHeld",
              label: t("depositHeld"),
              render: (r) => currency(r.depositHeld, lang),
            },
            {
              key: "depositRetained",
              label: t("retained"),
              render: (r) => currency(r.depositRetained, lang),
            },
            {
              key: "actions",
              label: t("actions"),
              render: (r) =>
                r.status === "returned" && r.depositHeld > 0 ? (
                  <button
                    className="button small"
                    onClick={() => open({ kind: "deposit", record: r })}
                  >
                    {t("settleDeposit")}
                  </button>
                ) : (
                  <Badge value={r.status} />
                ),
            },
          ]}
          onRow={(r) =>
            open({
              kind: "record",
              record: r,
              extra: { collection: "rentals" },
            })
          }
        />
      </Section>
      <Section title={t("payments")}>
        <Table
          rows={[...data.payments].reverse()}
          columns={[
            { key: "id", label: t("payments") },
            {
              key: "at",
              label: t("date"),
              render: (r) => dateText(r.at, lang, true),
            },
            {
              key: "invoiceId",
              label: t("invoiceNumber"),
              render: (r) =>
                data.invoices.find((i) => i.id === r.invoiceId)?.number ||
                r.rentalId,
            },
            {
              key: "type",
              label: t("type"),
              render: (r) =>
                t(r.type === "invoice" ? "invoices" : "settleDeposit"),
            },
            {
              key: "amount",
              label: t("amount"),
              render: (r) => currency(r.amount, lang),
            },
            {
              key: "method",
              label: t("paymentMethod"),
              render: (r) => t(r.method),
            },
          ]}
        />
      </Section>
    </>
  );
}

export function FinanceReport({ vehicleId }: { vehicleId?: string }) {
  const { data, go, open, can } = useApp(),
    { t, lang } = useI18n();
  const [period, setPeriod] = useState("year"),
    [mode, setMode] = useState("operatingView");
  const start =
      period === "month"
        ? today().slice(0, 7) + "-01"
        : period === "year"
          ? today().slice(0, 4) + "-01-01"
          : "1900-01-01",
    end = today();
  const vehicles = data.vehicles.filter(
      (v) => !vehicleId || v.id === vehicleId,
    ),
    invoices = data.invoices.filter(
      (i) =>
        (!vehicleId || i.vehicleId === vehicleId) &&
        i.status !== "cancelled" &&
        i.date >= start &&
        i.date <= end,
    ),
    costs = data.costs.filter(
      (c) =>
        (!vehicleId || c.vehicleId === vehicleId) &&
        c.date >= start &&
        c.date <= end,
    );
  const rows = vehicles.map((v) => {
    const rents = data.rentals.filter(
      (r) => r.vehicleId === v.id && ["active", "returned"].includes(r.status),
    );
    const used = new Set<string>();
    for (const r of rents) {
      const first = [
        r.handover?.at?.slice(0, 10) || r.start,
        start,
        v.acquired || "1900-01-01",
      ]
        .sort()
        .at(-1)!;
      const last = [
        r.returnedAt?.slice(0, 10) || (r.status === "returned" ? r.end : end),
        end,
      ].sort()[0];
      for (
        let d = first;
        d <= last;
        d = localDate(new Date(Date.parse(d + "T12:00:00") + 86400000))
      )
        used.add(d);
    }
    const first = [v.acquired || end, start].sort().at(-1)!,
      available = Math.max(1, days(first, end) + 1),
      rev = sum(
        invoices.filter((i) => i.vehicleId === v.id),
        "net",
      ),
      cost = sum(
        costs.filter((c) => c.vehicleId === v.id),
        "net",
      ),
      distance = Math.max(0, v.mileage - (v.baselineKm || v.mileage));
    const workshopDays = new Set<string>();
    for (const w of data.workOrders.filter(
      (w) =>
        w.vehicleId === v.id && ["progress", "complete"].includes(w.status),
    )) {
      const first = [
        w.startedAt?.slice(0, 10) || w.createdAt?.slice(0, 10) || end,
        start,
        v.acquired || end,
      ]
        .sort()
        .at(-1)!;
      const last = [w.completedAt?.slice(0, 10) || end, end].sort()[0];
      for (
        let d = first;
        d <= last;
        d = localDate(new Date(Date.parse(d + "T12:00:00") + 86400000))
      )
        if (!used.has(d)) workshopDays.add(d);
    }
    return {
      id: v.id,
      vehicle: `${v.make} ${v.model}`,
      plate: v.plate,
      revenue: rev,
      cost,
      result: rev - cost,
      rentalDays: used.size,
      workshopDays: workshopDays.size,
      idleDays: Math.max(0, available - used.size - workshopDays.size),
      margin: rev ? Math.round(((rev - cost) / rev) * 100) : null,
      utilization: Math.min(100, Math.round((used.size / available) * 100)),
      costPerKm: period === "allTime" && distance ? cost / distance : null,
      revenuePerDay: used.size ? rev / used.size : 0,
      investment:
        Number(v.purchasePrice || 0) + Number(v.acquisitionCosts || 0),
    };
  });
  const revenue = sum(invoices, "net"),
    expense = sum(costs, "net");
  return (
    <>
      <div className="page-heading">
        <h1>{t(vehicleId ? "finance" : "reports")}</h1>
        <div className="actions">
          <select
            aria-label={t("period")}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            {["month", "year", "allTime"].map((k) => (
              <option value={k} key={k}>
                {t(k)}
              </option>
            ))}
          </select>
          {can("export") && (
            <IconButton
              label={t("export")}
              onClick={() =>
                downloadCsv("financial-report", rows, [
                  "plate",
                  "revenue",
                  "cost",
                  "result",
                  "rentalDays",
                  "utilization",
                  "costPerKm",
                  "investment",
                ])
              }
            >
              <Download size={16} />
            </IconButton>
          )}
        </div>
      </div>
      <div className="tabs">
        {["operatingView", "cashView"].map((k) => (
          <button
            key={k}
            className={mode === k ? "active" : ""}
            onClick={() => setMode(k)}
          >
            {t(k)}
          </button>
        ))}
      </div>
      {mode === "operatingView" ? (
        <div className="stats-grid three">
          <Stat
            label={t("revenue")}
            value={currency(revenue, lang)}
            onClick={() => go("invoices")}
          />
          <Stat
            label={t("expenses")}
            value={currency(expense, lang)}
            tone="red"
            onClick={() => go("costs")}
          />
          <Stat
            label={t("result")}
            value={currency(revenue - expense, lang)}
            tone="green"
          />
        </div>
      ) : (
        <div className="stats-grid three">
          <Stat
            label={t("investment")}
            value={currency(sum(rows, "investment"), lang)}
          />
          <Stat
            label={t("paidAmount")}
            value={currency(
              sum(
                data.payments.filter(
                  (p) =>
                    p.type === "invoice" &&
                    (!vehicleId || p.vehicleId === vehicleId) &&
                    p.at.slice(0, 10) >= start,
                ),
                "amount",
              ),
              lang,
            )}
            tone="green"
          />
          <Stat
            label={t("deposits")}
            value={currency(
              sum(
                data.rentals.filter(
                  (r) => !vehicleId || r.vehicleId === vehicleId,
                ),
                "depositHeld",
              ),
              lang,
            )}
            tone="amber"
          />
        </div>
      )}
      <Table
        rows={rows}
        columns={[
          { key: "plate", label: t("vehicle") },
          { key: "rentalDays", label: t("rentalDays") },
          { key: "workshopDays", label: t("workshopDays") },
          { key: "idleDays", label: t("idleDays") },
          {
            key: "utilization",
            label: t("utilization"),
            render: (r) => (
              <div className="utilization">
                <div>
                  <span style={{ width: `${r.utilization}%` }} />
                </div>
                {r.utilization}%
              </div>
            ),
          },
          {
            key: "revenue",
            label: t("revenue"),
            render: (r) => currency(r.revenue, lang),
          },
          {
            key: "cost",
            label: t("expenses"),
            render: (r) => currency(r.cost, lang),
          },
          {
            key: "result",
            label: t("result"),
            render: (r) => currency(r.result, lang),
          },
          {
            key: "costPerKm",
            label: t("costPerKm"),
            render: (r) =>
              r.costPerKm === null ? "—" : currency(r.costPerKm, lang),
          },
          {
            key: "revenuePerDay",
            label: t("revenuePerDay"),
            render: (r) => currency(r.revenuePerDay, lang),
          },
          {
            key: "margin",
            label: t("margin"),
            render: (r) => (r.margin === null ? "—" : `${r.margin}%`),
          },
        ]}
      />
      <div className="dashboard-top">
        <Section title={t("invoices")}>
          <Table
            rows={invoices}
            columns={[
              { key: "number", label: t("invoiceNumber") },
              {
                key: "net",
                label: t("net"),
                render: (r) => currency(r.net, lang),
              },
            ]}
            onRow={(r) =>
              open({
                kind: "record",
                record: r,
                extra: { collection: "invoices" },
              })
            }
          />
        </Section>
        <Section title={t("costs")}>
          <Table
            rows={costs}
            columns={[
              { key: "description", label: t("description") },
              {
                key: "net",
                label: t("net"),
                render: (r) => currency(r.net, lang),
              },
            ]}
            onRow={(r) =>
              open({
                kind: "record",
                record: r,
                extra: { collection: "costs" },
              })
            }
          />
        </Section>
      </div>
    </>
  );
}

export function CalendarView() {
  const { data, open, run, notify, can } = useApp(),
    { t, lang } = useI18n();
  const [selected, setSelected] = useState(today()),
    [month, setMonth] = useState(today().slice(0, 7));
  const first = new Date(month + "-01T12:00:00"),
    offset = (first.getDay() + 6) % 7;
  const dates = Array.from({ length: 42 }, (_, i) =>
    localDate(new Date(first.getFullYear(), first.getMonth(), 1 - offset + i)),
  );
  const move = (n: number) =>
    setMonth(
      localDate(new Date(first.getFullYear(), first.getMonth() + n, 1)).slice(
        0,
        7,
      ),
    );
  const events = data.rentals.filter(
    (r) =>
      ["active", "reserved"].includes(r.status) &&
      (r.start === selected || r.end === selected),
  );
  const tasks = data.tasks.filter((r) => r.due === selected);
  const workshop = data.workOrders.filter(
    (w) => w.due === selected && w.status !== "complete",
  );
  const maintenance = data.vehicles.flatMap((v) =>
    ["inspectionDue", "insuranceDue", "serviceDue"]
      .filter((k) => v[k] === selected)
      .map((k) => ({ id: v.id + k, vehicle: v, type: k })),
  );
  return (
    <>
      <div className="page-heading">
        <h1>{t("calendar")}</h1>
        {can("tasks") && (
          <AddButton
            label={t("newTask")}
            onClick={() => open({ kind: "task", extra: { due: selected } })}
          />
        )}
      </div>
      <div className="calendar-layout">
        <section>
          <div className="section-head">
            <h2>{monthText(first, lang)}</h2>
            <div className="actions">
              <IconButton label={t("back")} onClick={() => move(-1)}>
                <ChevronLeft size={18} />
              </IconButton>
              <button
                className="button"
                onClick={() => {
                  setMonth(today().slice(0, 7));
                  setSelected(today());
                }}
              >
                {t("today")}
              </button>
              <IconButton label={t("next")} onClick={() => move(1)}>
                <ChevronRight size={18} />
              </IconButton>
            </div>
          </div>
          <div className="calendar-grid">
            {Array.from({ length: 7 }, (_, i) => (
              <strong key={i}>
                {new Intl.DateTimeFormat(locale(lang), {
                  weekday: "short",
                }).format(new Date(2026, 0, 5 + i))}
              </strong>
            ))}
            {dates.map((d) => {
              const count =
                data.rentals.filter(
                  (r) =>
                    ["reserved", "active"].includes(r.status) &&
                    (r.start === d || r.end === d),
                ).length +
                data.tasks.filter((r) => r.due === d && !r.done).length +
                data.workOrders.filter(
                  (w) => w.due === d && w.status !== "complete",
                ).length +
                data.vehicles.reduce(
                  (sum, v) =>
                    sum +
                    ["inspectionDue", "insuranceDue", "serviceDue"].filter(
                      (k) => v[k] === d,
                    ).length,
                  0,
                );
              return (
                <button
                  key={d}
                  className={`${d === selected ? "selected" : ""} ${d.slice(0, 7) !== month ? "outside" : ""} ${d === today() ? "today" : ""}`}
                  onClick={() => setSelected(d)}
                >
                  <span>{Number(d.slice(-2))}</span>
                  {count > 0 && <i>{count}</i>}
                </button>
              );
            })}
          </div>
        </section>
        <Section title={dateText(selected, lang)}>
          {events.map((r) => (
            <button
              className="schedule-row"
              key={r.id}
              onClick={() =>
                open({
                  kind: "record",
                  record: r,
                  extra: { collection: "rentals" },
                })
              }
            >
              <CalendarDays size={18} />
              <div>
                <strong>
                  {data.vehicles.find((v) => v.id === r.vehicleId)?.plate}
                </strong>
                <small>
                  {t(r.start === selected ? "handover" : "return")} · {r.id}
                </small>
              </div>
            </button>
          ))}
          {tasks.map((r) => (
            <label className="task-row" key={r.id}>
              <input
                type="checkbox"
                checked={r.done}
                disabled={r.autoManaged}
                onChange={async (e) => {
                  try {
                    await run("task.save", { ...r, done: e.target.checked });
                  } catch (err) {
                    notify((err as Error).message, true);
                  }
                }}
              />
              <span className={r.done ? "struck" : ""}>
                {r.autoManaged
                  ? `${data.vehicles.find((v) => v.id === r.vehicleId)?.plate || r.vehicleId} · ${t(r.serviceKind)}`
                  : r.title}
              </span>
            </label>
          ))}
          {workshop.map((w) => (
            <button
              className="schedule-row"
              key={w.id}
              onClick={() =>
                open({
                  kind: "record",
                  record: w,
                  extra: { collection: "workOrders" },
                })
              }
            >
              <Wrench size={18} />
              <div>
                <strong>{w.description}</strong>
                <small>{w.id}</small>
              </div>
            </button>
          ))}
          {maintenance.map((m) => (
            <div className="schedule-row" key={m.id}>
              <ClipboardCheck size={18} />
              <div>
                <strong>{m.vehicle.plate}</strong>
                <small>{t(m.type)}</small>
              </div>
            </div>
          ))}
          {!events.length &&
            !tasks.length &&
            !workshop.length &&
            !maintenance.length && <Empty />}
        </Section>
      </div>
    </>
  );
}

export function Messages() {
  const { data, run, notify } = useApp(),
    { t, lang } = useI18n();
  const [vehicleId, setVehicle] = useState(data.vehicles[0]?.id || ""),
    [body, setBody] = useState(""),
    [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const messages = data.messages.filter((m) => m.vehicleId === vehicleId);
  useEffect(() => {
    list.current?.scrollTo(0, list.current.scrollHeight);
  }, [messages.length, vehicleId]);
  return (
    <>
      <div className="page-heading">
        <h1>{t("messages")}</h1>
      </div>
      <div className="message-layout">
        <aside>
          {data.vehicles.map((v) => (
            <button
              className={v.id === vehicleId ? "selected" : ""}
              key={v.id}
              onClick={() => setVehicle(v.id)}
            >
              <VehiclePhoto vehicle={v} />
              <span>
                <strong>{v.plate}</strong>
                <small>
                  {v.make} {v.model}
                </small>
              </span>
            </button>
          ))}
        </aside>
        <section className="conversation">
          <header>
            <strong>
              {data.vehicles.find((v) => v.id === vehicleId)?.plate ||
                t("select")}
            </strong>
          </header>
          <div className="messages" ref={list}>
            {messages.length ? (
              messages.map((m) => (
                <div
                  className={`message-bubble ${m.senderId === data.user.id ? "mine" : ""}`}
                  key={m.id}
                >
                  <strong>{m.sender}</strong>
                  <p>{m.body}</p>
                  <time>{dateText(m.at, lang, true)}</time>
                </div>
              ))
            ) : (
              <Empty />
            )}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!body.trim() || busy) return;
              setBusy(true);
              try {
                await run("message.send", { vehicleId, body });
                setBody("");
              } catch (e) {
                notify((e as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <input
              aria-label={t("message")}
              placeholder={t("message")}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={5000}
              required
            />
            <button
              className="button primary"
              disabled={busy || !vehicleId || !body.trim()}
              aria-label={t("send")}
            >
              <Send size={18} />
            </button>
          </form>
        </section>
      </div>
    </>
  );
}

export function Locations() {
  const { data, run, notify } = useApp(),
    { t, lang } = useI18n();
  const [vehicleId, setVehicle] = useState(data.vehicles[0]?.id || ""),
    [consent, setConsent] = useState(false),
    [sharing, setSharing] = useState(false);
  const watch = useRef<number | null>(null),
    last = useRef(0);
  const stop = () => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setSharing(false);
  };
  useEffect(
    () => () => {
      if (watch.current !== null)
        navigator.geolocation.clearWatch(watch.current);
    },
    [],
  );
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, []);
  const start = () => {
    if (!consent || !vehicleId) return;
    if (!navigator.geolocation) {
      notify("locationDenied", true);
      return;
    }
    last.current = 0;
    setSharing(true);
    watch.current = navigator.geolocation.watchPosition(
      async (p) => {
        if (Date.now() - last.current < 15000) return;
        last.current = Date.now();
        try {
          await run("location.report", {
            vehicleId,
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            accuracy: p.coords.accuracy,
          });
        } catch (e) {
          notify((e as Error).message, true);
          stop();
        }
      },
      () => {
        notify("locationDenied", true);
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
  };
  return (
    <>
      <div className="page-heading">
        <h1>{t("locations")}</h1>
      </div>
      <FleetMap />
      <Section title={t("gps")}>
        {!window.isSecureContext && (
          <p className="form-error">{t("gpsHttps")}</p>
        )}
        <div className="gps-controls">
          <select
            value={vehicleId}
            aria-label={t("vehicle")}
            disabled={sharing}
            onChange={(e) => setVehicle(e.target.value)}
          >
            {data.vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate} · {v.make} {v.model}
              </option>
            ))}
          </select>
          <label className="check-label">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                if (!e.target.checked) stop();
              }}
            />
            {t("locationConsent")}
          </label>
          <button
            className={`button ${sharing ? "danger" : "primary"}`}
            disabled={!consent || !vehicleId || !window.isSecureContext}
            onClick={sharing ? stop : start}
          >
            <MapPin size={16} />
            {t(sharing ? "stopLocation" : "shareLocation")}
          </button>
          {sharing && <Badge value="gpsActive" />}
        </div>
      </Section>
      <div className="location-grid">
        {data.vehicles.map((v) => {
          const pos = data.locations
            .filter((p) => p.vehicleId === v.id)
            .sort((a, b) => b.at.localeCompare(a.at))[0];
          const stale = pos && Date.now() - Date.parse(pos.at) > 120000;
          return (
            <article key={v.id} className="location-item">
              <div className="section-head">
                <div>
                  <h2>{v.plate}</h2>
                  <p>
                    {v.make} {v.model}
                  </p>
                </div>
                <Badge value={v.status} />
              </div>
              <dl className="details">
                <dt>{t("manualLocation")}</dt>
                <dd>{v.location}</dd>
                {pos ? (
                  <>
                    <dt>{t("lastUpdate")}</dt>
                    <dd>{dateText(pos.at, lang, true)}</dd>
                    <dt>{t("accuracy")}</dt>
                    <dd>± {Math.round(pos.accuracy)} m</dd>
                    <dt>{t("source")}</dt>
                    <dd>
                      {t(pos.source === "demo" ? "demoLocation" : pos.source)}
                    </dd>
                  </>
                ) : null}
              </dl>
              {pos ? (
                <>
                  <p className="coordinates">
                    {pos.latitude.toFixed(6)}, {pos.longitude.toFixed(6)}
                  </p>
                  {stale && <Badge value="stale" />}
                  <a
                    className="button"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://www.openstreetmap.org/?mlat=${pos.latitude}&mlon=${pos.longitude}#map=16/${pos.latitude}/${pos.longitude}`}
                  >
                    <MapPin size={16} />
                    {t("openMap")}
                  </a>
                </>
              ) : (
                <div className="no-location">
                  <MapPin size={28} />
                  {t("noLocation")}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}

export function Settings() {
  const { data, run, notify } = useApp(),
    { t } = useI18n();
  const [value, set] = useState<Record<string, any>>({ ...data.settings[0] });
  return (
    <>
      <div className="page-heading">
        <h1>{t("settings")}</h1>
      </div>
      <Section title={t("companyDetails")}>
        <SubmitForm
          onCancel={() => set({ ...data.settings[0] })}
          onSubmit={async () => {
            await run("settings.save", value);
            notify("saved");
          }}
        >
          <Fields
            value={value}
            set={set}
            fields={[
              { key: "name", required: true },
              { key: "address", required: true },
              { key: "email", type: "email" },
              { key: "taxId", required: true },
              { key: "iban" },
              { key: "invoicePrefix", required: true },
              { key: "tax", type: "number", required: true, min: 0, max: 100 },
              { key: "terms", type: "textarea", wide: true },
            ]}
          />
        </SubmitForm>
      </Section>
      <p>
        <a href="/credits.html" target="_blank" rel="noreferrer">
          {t("imageCredits")}
        </a>
      </p>
    </>
  );
}

export function Users() {
  const { data, open } = useApp(),
    { t, lang } = useI18n();
  return (
    <>
      <div className="page-heading">
        <h1>{t("users")}</h1>
        <AddButton
          label={t("newUser")}
          onClick={() => open({ kind: "user" })}
        />
      </div>
      <Table
        rows={data.users as RecordData[]}
        onRow={(u) => {
          if (u.id !== data.user.id) open({ kind: "access", record: u });
        }}
        columns={[
          { key: "name", label: t("name") },
          { key: "email", label: t("email") },
          {
            key: "role",
            label: t("role"),
            render: (r) => <Badge value={r.role} />,
          },
          {
            key: "customerId",
            label: t("customer"),
            render: (r) =>
              data.customers.find((c) => c.id === r.customerId)?.name || "—",
          },
        ]}
      />
      <Section title={t("permissions")}>
        <Table
          rows={[
            {
              id: "admin",
              vehicles: true,
              rentals: true,
              workOrders: true,
              articles: true,
              finance: true,
            },
            {
              id: "employee",
              vehicles: true,
              rentals: true,
              workOrders: false,
              articles: false,
              finance: false,
            },
            {
              id: "mechanic",
              vehicles: true,
              rentals: false,
              workOrders: true,
              articles: true,
              finance: false,
            },
            {
              id: "warehouse",
              vehicles: false,
              rentals: false,
              workOrders: false,
              articles: true,
              finance: false,
            },
            {
              id: "accountant",
              vehicles: true,
              rentals: true,
              workOrders: false,
              articles: false,
              finance: true,
            },
            {
              id: "client",
              vehicles: true,
              rentals: true,
              workOrders: false,
              articles: false,
              finance: false,
            },
            {
              id: "driver",
              vehicles: true,
              rentals: false,
              workOrders: false,
              articles: false,
              finance: false,
            },
          ]}
          columns={[
            { key: "id", label: t("role"), render: (r) => t(r.id) },
            ...["vehicles", "rentals", "workOrders", "articles", "finance"].map(
              (key) => ({
                key,
                label: t(key),
                render: (r: RecordData) =>
                  r[key] ? <Check className="green-text" size={17} /> : "—",
              }),
            ),
          ]}
        />
      </Section>
      <Section title={t("audit")}>
        <Table
          rows={data.audit}
          columns={[
            {
              key: "time",
              label: t("date"),
              render: (r) => dateText(r.time, lang, true),
            },
            {
              key: "userId",
              label: t("user"),
              render: (r) =>
                data.users.find((u) => u.id === r.userId)?.name || r.userId,
            },
            { key: "kind", label: t("type"), render: (r) => t(r.kind) },
            { key: "recordId", label: t("linkedRecord") },
          ]}
          onRow={(r) => open({ kind: "auditDetail", record: r })}
        />
      </Section>
    </>
  );
}
