import { useState } from "react";
import {
  Bell,
  Car,
  ChevronRight,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageSquare,
  Package,
  Plus,
  Search,
  ShieldCheck,
  Smartphone,
  Wrench,
  ArrowUpRight,
  PenLine,
  CalendarDays,
  LoaderCircle,
} from "lucide-react";
import { api, surface, useApp } from "./core";
import { useI18n } from "./i18n";
import { Badge, Brand, IconButton, VehiclePhoto, Empty } from "./ui";
import { dateText, locale } from "./utils";
const number = (value: number, lang: Parameters<typeof locale>[0]) =>
  value.toLocaleString(locale(lang));
import type { View } from "./types";

export function DesktopPortal({ title }: { title: string }) {
  return (
    <div className="portal-desktop">
      <iframe
        className="portal-mobile-frame"
        title={title}
        src={`${location.pathname}${location.search}${location.hash}`}
        allow="geolocation; microphone; camera"
      />
    </div>
  );
}
export function ClientDemoProfiles({
  onChange,
}: {
  onChange: () => Promise<void>;
}) {
  const { data } = useApp(),
    { t } = useI18n();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="client-demo-profiles" aria-label={t("demoProfile")}>
      <span className="demo-label">{t("demo")}</span>
      <div className="segmented" aria-label={t("demoProfile")}>
        {(["client", "driver"] as const).map((role) => (
          <button
            key={role}
            disabled={busy}
            aria-pressed={data.user.id === `demo-${role}`}
            className={data.user.id === `demo-${role}` ? "active" : ""}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api("demo", { role });
                await onChange();
              } catch (e) {
                setError(t((e as Error).message));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t(role === "client" ? "companyClient" : "assignedDriver")}
          </button>
        ))}
      </div>
      {busy && <LoaderCircle className="spin" size={16} />}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
export function AppSwitcher() {
  const { data } = useApp(),
    { t } = useI18n();
  return (
    <div className="app-switcher">
      {(["board", "clients", "workshop"] as const)
        .filter((k) => data.user.apps?.[k])
        .map((k) => (
          <a
            key={k}
            href={k === "board" ? "/" : `/${k}`}
            target="_top"
            className={surface === k ? "current" : ""}
          >
            {k === "board" ? (
              <LayoutDashboard size={16} />
            ) : k === "clients" ? (
              <Smartphone size={16} />
            ) : (
              <Wrench size={16} />
            )}
            <span>
              {t(
                k === "board"
                  ? "primaryBoard"
                  : k === "clients"
                    ? "clientsApp"
                    : "workshopApp",
              )}
            </span>
            <ArrowUpRight size={14} />
          </a>
        ))}
    </div>
  );
}
export function PortalNavigation({ view }: { view: View }) {
  const { data, go, can } = useApp(),
    { t } = useI18n();
  const [account, setAccount] = useState(false);
  const items =
    surface === "clients"
      ? ([
          ["dashboard", Car],
          ["documents", FileText],
          ["locations", MapPin],
          ["messages", MessageSquare],
        ] as const)
      : ([
          ["dashboard", LayoutDashboard],
          ["workOrders", Wrench],
          ["articles", Package],
          ["messages", MessageSquare],
        ] as const);
  return (
    <>
      <div className="portal-brandbar">
        <Brand />
        <button
          className="portal-account"
          aria-label={t("account")}
          onClick={() => setAccount(!account)}
        >
          <span>
            {data.user.name
              .split(" ")
              .map((x) => x[0])
              .slice(0, 2)
              .join("")}
          </span>
          <ShieldCheck size={15} />
        </button>
      </div>
      {account && (
        <div className="portal-account-menu">
          <strong>{data.user.name}</strong>
          <small>{t(data.user.role)}</small>
          <AppSwitcher />
          <button
            className="button"
            onClick={async () => {
              await api("logout", {});
              location.reload();
            }}
          >
            <LogOut size={16} />
            {t("logout")}
          </button>
        </div>
      )}
      <nav className="portal-bottom-nav">
        {items
          .filter(([key]) => key === "dashboard" || can(key))
          .map(([key, Icon]) => (
            <button
              key={key}
              className={view === key ? "active" : ""}
              onClick={() => go(key)}
            >
              <Icon size={21} />
              <span>{t(key === "dashboard" ? "home" : key)}</span>
              {key === "messages" &&
                data.notifications.some(
                  (n) => n.view === "messages" && !n.read,
                ) && <i />}
            </button>
          ))}
      </nav>
    </>
  );
}
export function ClientHome() {
  const { data, go, selectVehicle, open, can } = useApp(),
    { t, lang } = useI18n();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const currentRentals = data.rentals.filter((r) =>
    ["active", "reserved"].includes(r.status),
  );
  const rentalFor = (id: string) =>
    currentRentals.find((r) => r.vehicleId === id && r.status === "active") ||
    currentRentals.find((r) => r.vehicleId === id);
  const vehicles = data.vehicles.filter((v) => {
    const rental = rentalFor(v.id);
    return (
      (filter === "all" || rental?.status === filter) &&
      `${v.make} ${v.model} ${v.plate} ${rental?.id || ""}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase())
    );
  });
  const appointments = currentRentals
    .map((r) => ({
      rental: r,
      date: r.status === "reserved" ? r.start : r.end,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("clientsApp")}</span>
          <h1>
            {t("hello")}, {data.user.name.split(" ")[0]}.
          </h1>
        </div>
        <Badge value={data.user.role} />
      </div>
      <div className="portal-summary">
        <div>
          <strong>{data.vehicles.length}</strong>
          <span>{t("myVehicles")}</span>
        </div>
        <div>
          <strong>{data.notifications.filter((n) => !n.read).length}</strong>
          <span>{t("unread")}</span>
        </div>
        <button onClick={() => go("messages")}>
          <MessageSquare size={24} />
          <span>{t("contactTeam")}</span>
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="section-head">
        <h2>{t("myVehicles")}</h2>
        <button className="text-action" onClick={() => go("locations")}>
          <MapPin size={16} />
          {t("locations")}
        </button>
      </div>
      <div className="client-fleet-filters">
        <label className="chat-search">
          <Search size={17} />
          <input
            aria-label={t("vehicleSearch")}
            placeholder={t("vehicleSearch")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="segmented">
          {["all", "active", "reserved"].map((key) => (
            <button
              key={key}
              aria-pressed={filter === key}
              className={filter === key ? "active" : ""}
              onClick={() => setFilter(key)}
            >
              {t(key)}
            </button>
          ))}
        </div>
      </div>
      <div className="client-vehicle-grid">
        {vehicles.map((v) => {
          const rental = rentalFor(v.id);
          const damageCount = data.damages.filter(
            (d) => d.vehicleId === v.id && d.status !== "repaired",
          ).length;
          return (
            <article className="client-vehicle" key={v.id}>
              <button
                className="client-vehicle-photo"
                onClick={() => selectVehicle(v.id)}
              >
                <VehiclePhoto vehicle={v} large />
                <span className="plate">{v.plate}</span>
              </button>
              <div className="client-vehicle-body">
                <div className="section-head">
                  <h2>
                    {v.make} {v.model}
                  </h2>
                  <Badge
                    value={
                      rental?.status === "reserved" ? "reserved" : v.status
                    }
                  />
                </div>
                {rental && (
                  <div className="client-rental-reference">
                    <FileText size={15} />
                    <span>{rental.id}</span>
                  </div>
                )}
                <div className="vehicle-metrics">
                  <div>
                    <span>{t("mileage")}</span>
                    <strong>{number(v.mileage, lang)} km</strong>
                  </div>
                  <div>
                    <span>{t("fuel")}</span>
                    <strong>{v.fuel}%</strong>
                  </div>
                  <div>
                    <span>{t("end")}</span>
                    <strong>{rental ? dateText(rental.end, lang) : "—"}</strong>
                  </div>
                </div>
                <button
                  className="client-damage-link"
                  onClick={() => selectVehicle(v.id, "damages")}
                >
                  <ShieldCheck size={17} />
                  <span>{t("existingDamage")}</span>
                  <strong>{damageCount}</strong>
                  <ChevronRight size={16} />
                </button>
                <div className="actions">
                  <button
                    className="button"
                    onClick={() => selectVehicle(v.id)}
                  >
                    <Car size={16} />
                    {t("overview")}
                  </button>
                  {can("damages:create") && (
                    <button
                      className="button primary"
                      onClick={() => open({ kind: "damage", vehicleId: v.id })}
                    >
                      <Plus size={16} />
                      {t("newDamage")}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!vehicles.length &&
        (data.vehicles.length ? (
          <Empty />
        ) : (
          <p className="empty">{t("noAssignedVehicles")}</p>
        ))}
      <section className="section client-schedule">
        <div className="section-head">
          <h2>{t("rentalSchedule")}</h2>
          <CalendarDays size={20} />
        </div>
        <div className="client-schedule-list">
          {appointments.map(({ rental: r, date }) => {
            const v = data.vehicles.find((v) => v.id === r.vehicleId);
            return (
              <button key={r.id} onClick={() => selectVehicle(r.vehicleId)}>
                <span className="client-date">
                  <strong>{dateText(date, lang)}</strong>
                  <small>
                    {t(
                      r.status === "reserved"
                        ? "pickupAppointment"
                        : "returnAppointment",
                    )}
                  </small>
                </span>
                <span>
                  <strong>{v ? `${v.make} ${v.model}` : r.vehicleId}</strong>
                  <small>
                    {v?.plate} · {r.id}
                  </small>
                </span>
                <ChevronRight size={18} />
              </button>
            );
          })}
          {!appointments.length && (
            <p className="empty">{t("noAppointments")}</p>
          )}
        </div>
      </section>
      <section className="section">
        <div className="section-head">
          <h2>{t("recentActivity")}</h2>
          <button className="text-action" onClick={() => go("notifications")}>
            <Bell size={16} />
            {t("all")}
          </button>
        </div>
        <div className="portal-activity">
          {data.notifications.slice(0, 4).map((n) => (
            <button key={n.id} onClick={() => go(n.view as View)}>
              <span className="activity-icon">
                {n.view === "messages" ? (
                  <MessageSquare size={18} />
                ) : (
                  <ClipboardCheck size={18} />
                )}
              </span>
              <span>
                <strong>{t(n.title)}</strong>
                <small>{n.body}</small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
          {!data.notifications.length && (
            <p className="empty">{t("noRecentActivity")}</p>
          )}
        </div>
      </section>
      <section className="section">
        <div className="section-head">
          <h2>{t("documents")}</h2>
          <button className="text-action" onClick={() => go("documents")}>
            <ArrowUpRight size={16} />
            {t("all")}
          </button>
        </div>
        <div className="portal-documents">
          {data.documents.map((d) => (
            <a key={d.id} href={d.file} target="_blank" rel="noreferrer">
              <FileText size={24} />
              <span>
                <strong>{d.title}</strong>
                <small>
                  {data.vehicles.find((v) => v.id === d.vehicleId)?.plate} ·{" "}
                  {dateText(d.date, lang)}
                </small>
              </span>
              <ArrowUpRight size={16} />
            </a>
          ))}
          {!data.documents.length && (
            <p className="empty">{t("noSharedDocuments")}</p>
          )}
        </div>
      </section>
    </>
  );
}
export function WorkshopHome() {
  const { data, can, go, open } = useApp(),
    { t, lang } = useI18n();
  const [filter, setFilter] = useState("active");
  const orders = data.workOrders.filter(
    (w) =>
      filter === "all" ||
      (filter === "mine"
        ? w.assignedTo === data.user.id
        : w.status !== "complete"),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("workshopApp")}</span>
          <h1>
            {t("hello")}, {data.user.name.split(" ")[0]}.
          </h1>
        </div>
        <Badge value={data.user.role} />
      </div>
      <div className="workshop-metrics">
        <button onClick={() => go("workOrders")}>
          <Wrench size={20} />
          <strong>
            {data.workOrders.filter((w) => w.status !== "complete").length}
          </strong>
          <span>{t("openOrders")}</span>
        </button>
        <button onClick={() => go("articles", "lowStock")}>
          <Package size={20} />
          <strong>
            {
              data.articles.filter((a) => a.stock - a.reserved < a.minimum)
                .length
            }
          </strong>
          <span>{t("lowStock")}</span>
        </button>
        <button onClick={() => go("notifications")}>
          <Bell size={20} />
          <strong>{data.notifications.filter((n) => !n.read).length}</strong>
          <span>{t("unread")}</span>
        </button>
      </div>
      <div className="section-head">
        <h2>{t("workOrders")}</h2>
        {can("workOrders:create") && (
          <button
            className="button primary"
            onClick={() => open({ kind: "work" })}
          >
            <Plus size={16} />
            {t("newWork")}
          </button>
        )}
      </div>
      <div className="segmented">
        {["active", "mine", "all"].map((k) => (
          <button
            key={k}
            className={filter === k ? "active" : ""}
            onClick={() => setFilter(k)}
          >
            {t(k)}
          </button>
        ))}
      </div>
      <div className="work-order-list">
        {orders.map((w) => {
          const v = data.vehicles.find((v) => v.id === w.vehicleId);
          return (
            <button
              key={w.id}
              className="work-order-card"
              onClick={() =>
                open({
                  kind: "record",
                  record: w,
                  extra: { collection: "workOrders" },
                })
              }
            >
              <div className="section-head">
                <span className="record-number">{w.id}</span>
                <Badge value={w.priority} />
              </div>
              <h3>{w.description}</h3>
              <p>{v ? `${v.make} ${v.model} · ${v.plate}` : t("external")}</p>
              <div className="work-order-meta">
                <span>{dateText(w.due, lang)}</span>
                <span>{w.hours} h</span>
                <Badge value={w.status} />
                <ChevronRight size={17} />
              </div>
            </button>
          );
        })}
      </div>
      <section className="section">
        <div className="section-head">
          <h2>{t("tasks")}</h2>
          <button className="text-action" onClick={() => go("calendar")}>
            {t("all")}
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="portal-activity">
          {data.tasks
            .filter((x) => !x.done)
            .sort((a, b) => String(a.due).localeCompare(String(b.due)))
            .slice(0, 6)
            .map((task) => (
              <button key={task.id} onClick={() => go("calendar")}>
                <ClipboardCheck size={19} />
                <span>
                  <strong>
                    {task.autoManaged
                      ? `${data.vehicles.find((v) => v.id === task.vehicleId)?.plate || task.vehicleId} · ${t(task.serviceKind)}`
                      : task.title}
                  </strong>
                  <small>{dateText(task.due, lang)}</small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
        </div>
      </section>
    </>
  );
}
export function WorkshopInventory() {
  const { data, open, can } = useApp(),
    { t } = useI18n();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const rows = data.articles.filter(
    (a) =>
      (filter !== "lowStock" || a.stock - a.reserved < a.minimum) &&
      `${a.name} ${a.sku} ${a.location}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("workshopApp")}</span>
          <h1>{t("articles")}</h1>
        </div>
        {can("articles:create") && (
          <button
            className="button primary"
            onClick={() => open({ kind: "article" })}
          >
            <Plus size={16} />
            {t("newArticle")}
          </button>
        )}
      </div>
      <div className="inventory-summary">
        <Package size={25} />
        <strong>{data.articles.length}</strong>
        <span>{t("articles")}</span>
        <Badge value={can("articles:edit") ? "edit" : "readOnly"} />
      </div>
      <div className="filters">
        <label className="chat-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t("searchParts")}
            placeholder={t("searchParts")}
          />
        </label>
        <select
          value={filter}
          aria-label={t("status")}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">{t("all")}</option>
          <option value="lowStock">{t("lowStock")}</option>
        </select>
      </div>
      <div className="inventory-grid">
        {rows.map((a) => (
          <article className="inventory-item" key={a.id}>
            <div className="section-head">
              <span className="record-number">{a.sku}</span>
              <span className="shelf-label">{a.location}</span>
              {can("articles:edit") && (
                <IconButton
                  label={t("edit")}
                  onClick={() => open({ kind: "article", record: a })}
                >
                  <PenLine size={16} />
                </IconButton>
              )}
            </div>
            <h3>{a.name}</h3>
            <p>{a.manufacturer}</p>
            <div className="stock-meter">
              <span
                className={a.stock - a.reserved < a.minimum ? "low" : ""}
                style={{
                  width: `${Math.min(100, ((a.stock - a.reserved) / Math.max(a.minimum * 3, 1)) * 100)}%`,
                }}
              />
            </div>
            <div className="vehicle-metrics">
              <div>
                <span>{t("stock")}</span>
                <strong>
                  {a.stock} {a.unit}
                </strong>
              </div>
              <div>
                <span>{t("reserved")}</span>
                <strong>{a.reserved}</strong>
              </div>
              <div>
                <span>{t("minimum")}</span>
                <strong>{a.minimum}</strong>
              </div>
            </div>
            <div className="actions">
              <button
                className="button"
                onClick={() =>
                  open({
                    kind: "record",
                    record: a,
                    extra: { collection: "articles" },
                  })
                }
              >
                <FileText size={16} />
                {t("overview")}
              </button>
              {can("articles:edit") && (
                <button
                  className="button primary"
                  onClick={() => open({ kind: "stock", record: a })}
                >
                  <Package size={16} />
                  {t("stockMove")}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
