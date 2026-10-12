import { useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Camera,
  Crosshair,
  Plus,
  PenLine,
  MapPin,
  FileText,
  Wrench,
  Car,
} from "lucide-react";
import { useApp } from "./core";
import { useI18n } from "./i18n";
import { angles } from "./data";
import {
  Badge,
  Section,
  VehiclePhoto,
  IconButton,
  FileInput,
  Stat,
  Table,
  Empty,
} from "./ui";
import { dateText, currency, due, today, days, sum, locale } from "./utils";
import { CollectionView, FinanceReport } from "./views";
import type { Vehicle, RecordData } from "./types";

export function PhotoInspection({ vehicle: v }: { vehicle: Vehicle }) {
  const { data, open, run, notify, can } = useApp(),
    { t } = useI18n();
  const [angle, setAngle] = useState(
      angles.find((k) => v.photos[k]) || "front",
    ),
    [mark, setMark] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const index = angles.indexOf(angle),
    photo = v.photos[angle],
    damage = data.damages.filter(
      (d) =>
        d.vehicleId === v.id &&
        d.positioned!==false &&
        d.angle === angle &&
        (d.photo === photo ||
          (photo &&
            new URL(photo, window.location.origin).searchParams.get("v") &&
            new URL(photo, window.location.origin).searchParams.get("v") ===
              new URL(d.photo, window.location.origin).searchParams.get(
                "v",
              ))) &&
        d.status !== "closed",
    );
  const editable = ["admin", "employee", "mechanic"].includes(data.user.role);
  const step = (delta: number) => setAngle(angles[(index + delta + 8) % 8]);
  return (
    <Section
      title={t("photoViews")}
      action={<span className="muted">{Object.keys(v.photos).length} / 8</span>}
    >
      <div className={`photo-stage ${mark ? "marking" : ""}`}>
        <div
          className="photo-inner"
          onPointerDown={(e) => {
            start.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            if (!start.current) return;
            const dx = e.clientX - start.current.x,
              dy = e.clientY - start.current.y;
            start.current = null;
            if (Math.abs(dx) > 35 && !mark) {
              step(dx > 0 ? -1 : 1);
              return;
            }
            if (mark && photo && Math.abs(dx) < 8 && Math.abs(dy) < 8) {
              const rect = e.currentTarget.getBoundingClientRect();
              open({
                kind: "damage",
                vehicleId: v.id,
                extra: {
                  angle,
                  x: (e.clientX - rect.left) / rect.width,
                  y: (e.clientY - rect.top) / rect.height,
                  rentalId:
                    data.rentals.find(
                      (r) => r.vehicleId === v.id && r.status === "active",
                    )?.id || "",
                },
              });
              setMark(false);
            }
          }}
        >
          {photo ? (
            <img
              src={photo}
              alt={`${v.make} ${v.model} · ${t(angle)}`}
              draggable={false}
            />
          ) : (
            <div className="no-angle">
              <Camera size={40} />
              <span>{t(angle)}</span>
              <small>{t("noPhoto")}</small>
            </div>
          )}
          {damage.map((d, i) => (
            <button
              key={d.id}
              className="damage-pin"
              style={{ left: `${d.x * 100}%`, top: `${d.y * 100}%` }}
              title={d.description}
              aria-label={d.description}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={() =>
                open({
                  kind: "record",
                  record: d,
                  extra: { collection: "damages" },
                })
              }
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
      <div className="angle-controls">
        <IconButton label={t("back")} onClick={() => step(-1)}>
          <ChevronLeft size={18} />
        </IconButton>
        <strong>{t(angle)}</strong>
        <IconButton label={t("next")} onClick={() => step(1)}>
          <ChevronRight size={18} />
        </IconButton>
      </div>
      <input
        type="range"
        className="angle-range"
        min={0}
        max={7}
        value={index}
        aria-label={t("photoViews")}
        onChange={(e) => setAngle(angles[Number(e.target.value)])}
      />
      <div className="angle-grid">
        {angles.map((k) => (
          <button
            key={k}
            className={angle === k ? "active" : ""}
            onClick={() => setAngle(k)}
          >
            {v.photos[k] ? (
              <img src={v.photos[k]} alt="" />
            ) : (
              <Camera size={17} />
            )}
            <span>{t(k)}</span>
          </button>
        ))}
      </div>
      <div className="photo-actions">
        {editable && (
          <FileInput
            imageOnly
            onFile={async (file) => {
              try {
                await run("vehicle.photo", { id: v.id, angle, photo: file });
              } catch (e) {
                notify((e as Error).message, true);
              }
            }}
          />
        )}{" "}
        {can("damages") && (
          <button
            className={`button ${mark ? "danger" : ""}`}
            disabled={!photo}
            aria-pressed={mark}
            onClick={() => setMark(!mark)}
          >
            <Crosshair size={17} />
            {t("markDamage")}
          </button>
        )}
      </div>
    </Section>
  );
}

export function VehicleDetail({
  id,
  initialTab = "overview",
  back,
}: {
  id: string;
  initialTab?: string;
  back: () => void;
}) {
  const { data, can, open, run, notify } = useApp(),
    { t, lang } = useI18n();
  const [tab, setTab] = useState(initialTab);
  const v = data.vehicles.find((v) => v.id === id);
  if (!v) return <Empty />;
  const rental = data.rentals.find(
    (r) => r.vehicleId === id && r.status === "active",
  );
  const internal = !["client", "driver"].includes(data.user.role),
    edit = ["admin", "employee"].includes(data.user.role);
  const tabs = [
    "overview",
    ...(can("rentals") ? ["rentals"] : []),
    ...(can("costs") ? ["costs"] : []),
    ...(can("damages") ? ["damages"] : []),
    ...(can("services") ? ["services"] : []),
    ...(can("repairs") ? ["repairs"] : []),
    ...(can("workOrders") ? ["workOrders"] : []),
    ...(can("documents") ? ["documents"] : []),
    ...(can("finance") ? ["finance"] : []),
    "timeline",
    ...(can("finance") ? ["statistics"] : []),
  ];
  return (
    <>
      <button className="back-link" onClick={back}>
        <ArrowLeft size={16} />
        {t("vehicles")}
      </button>
      <div className="vehicle-header">
        <VehiclePhoto vehicle={v} large />
        <div className="vehicle-heading">
          <div className="eyebrow">
            {v.id} · {t(v.type)} · {v.year}
          </div>
          <h1>
            {v.make} {v.model}
          </h1>
          <div className="vehicle-meta">
            <span className="plate">{v.plate}</span>
            <span>VIN {v.vin}</span>
            <span>{v.mileage.toLocaleString(locale(lang))} km</span>
          </div>
          <div className="location-inline">
            <MapPin size={14} />
            {v.location}
          </div>
        </div>
        <div className="vehicle-status">
          <Badge value={v.status} />
          {edit && (
            <button
              className="button"
              onClick={() => open({ kind: "vehicle", record: v })}
            >
              <PenLine size={15} />
              {t("edit")}
            </button>
          )}
        </div>
      </div>
      <div className="vehicle-actions">
        {edit && (
          <button
            className="button primary"
            onClick={() => open({ kind: "rental", vehicleId: v.id })}
          >
            <Plus size={16} />
            {t("newRental")}
          </button>
        )}
        {can("workOrders") && (
          <button
            className="button"
            onClick={() => open({ kind: "work", vehicleId: id })}
          >
            <Wrench size={16} />
            {t("newWork")}
          </button>
        )}
        {can("services") && internal && (
          <button
            className="button"
            onClick={() => open({ kind: "service", vehicleId: id })}
          >
            {t("newService")}
          </button>
        )}
        {can("costs") && (
          <button
            className="button"
            onClick={() => open({ kind: "cost", vehicleId: id })}
          >
            {t("newCost")}
          </button>
        )}
        {can("documents") && internal && (
          <button
            className="button"
            onClick={() => open({ kind: "document", vehicleId: id })}
          >
            <FileText size={16} />
            {t("newDocument")}
          </button>
        )}
      </div>
      <nav className="tabs">
        {tabs.map((k) => (
          <button
            key={k}
            className={tab === k ? "active" : ""}
            onClick={() => setTab(k)}
          >
            {t(k)}
          </button>
        ))}
      </nav>
      {tab === "overview" && (
        <>
          <div className="vehicle-overview">
            <PhotoInspection vehicle={v} />
            <div>
              <Section title={t("currentRental")}>
                {rental ? (
                  <button
                    className="rental-summary"
                    onClick={() =>
                      open({
                        kind: "record",
                        record: rental,
                        extra: { collection: "rentals" },
                      })
                    }
                  >
                    <Badge value="active" />
                    <strong>
                      {data.customers.find((c) => c.id === rental.customerId)
                        ?.name || data.user.name}
                    </strong>
                    <span>{rental.id}</span>
                    <span>
                      {dateText(rental.start, lang)} –{" "}
                      {dateText(rental.end, lang)}
                    </span>
                  </button>
                ) : (
                  <p className="muted">{t("noRental")}</p>
                )}
              </Section>
              <Section title={t("technical")}>
                <dl className="details">
                  {["inspectionDue", "insuranceDue", "serviceDue"].map((k) => (
                    <div key={k} className="detail-pair">
                      <dt>{t(k)}</dt>
                      <dd className={due(v[k]) <= 30 ? "warning-text" : ""}>
                        {dateText(v[k], lang)}
                      </dd>
                    </div>
                  ))}
                  <dt>{t("serviceKm")}</dt>
                  <dd
                    className={v.mileage >= v.serviceKm ? "warning-text" : ""}
                  >
                    {v.serviceKm?.toLocaleString(locale(lang))} km
                  </dd>
                  <dt>{t("fuel")}</dt>
                  <dd>{v.fuel}%</dd>
                  <dt>{t("tireType")}</dt>
                  <dd>{t(v.tireType || "none")}</dd>
                  <dt>{t("tireDate")}</dt>
                  <dd>{dateText(v.tireDate, lang)}</dd>
                </dl>
              </Section>
              <Section title={t("insurance")}>
                <dl className="details">
                  {[
                    "insuranceProvider",
                    "insuranceBroker",
                    "insuranceEmail",
                    "insurancePolicy",
                  ]
                    .filter((k) => v[k] !== undefined)
                    .map((k) => (
                      <div className="detail-pair" key={k}>
                        <dt>{t(k)}</dt>
                        <dd>{v[k] || "—"}</dd>
                      </div>
                    ))}
                </dl>
              </Section>
              {["admin", "employee", "mechanic"].includes(data.user.role) && (
                <Section title={t("status")}>
                  <select
                    aria-label={t("status")}
                    value={
                      [
                        "available",
                        "maintenance",
                        "blocked",
                        "inspection",
                      ].includes(v.status)
                        ? v.status
                        : ""
                    }
                    onChange={async (e) => {
                      try {
                        await run("vehicle.status", {
                          id: v.id,
                          status: e.target.value,
                        });
                      } catch (error) {
                        notify((error as Error).message, true);
                      }
                    }}
                  >
                    <option value="" disabled>
                      {t(v.status)}
                    </option>
                    {["available", "maintenance", "blocked", "inspection"].map(
                      (k) => (
                        <option key={k} value={k}>
                          {t(k)}
                        </option>
                      ),
                    )}
                  </select>
                </Section>
              )}
            </div>
          </div>
          {v.notes && (
            <Section title={t("notes")}>
              <p className="pre-wrap">{v.notes}</p>
            </Section>
          )}
        </>
      )}
      {tab === "damages" && (
        <>
          <PhotoInspection vehicle={v} />
          <CollectionView view="damages" vehicleId={id} />
        </>
      )}
      {[
        "rentals",
        "costs",
        "services",
        "repairs",
        "workOrders",
        "documents",
      ].includes(tab) && <CollectionView view={tab as any} vehicleId={id} />}
      {["finance", "statistics"].includes(tab) && (
        <FinanceReport vehicleId={id} />
      )}
      {tab === "timeline" && <Timeline vehicleId={id} />}
    </>
  );
}

export function Timeline({ vehicleId }: { vehicleId: string }) {
  const { data, open } = useApp(),
    { t, lang } = useI18n();
  const [filter, setFilter] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const kinds = [
    "rentals",
    "damages",
    "services",
    "repairs",
    "workOrders",
    "costs",
    "documents",
    "payments",
  ];
  const rows = kinds
    .flatMap((kind) =>
      ((data as unknown as Record<string, RecordData[]>)[kind] || [])
        .filter((r) => r.vehicleId === vehicleId)
        .map((r) => ({
          ...r,
          kind,
          at: r.createdAt || r.at || r.date || r.start,
          description: r.description || r.title || r.number || r.id,
        })),
    )
    .filter(
      (r) =>
        (!filter || r.kind === filter) &&
        (!from || r.at.slice(0, 10) >= from) &&
        (!to || r.at.slice(0, 10) <= to),
    )
    .sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Section title={t("timeline")}>
      <div className="filters">
        <select
          aria-label={t("type")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">{t("all")}</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {t(k)}
            </option>
          ))}
        </select>
        <input
          aria-label={t("from")}
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <input
          aria-label={t("to")}
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      <div className="timeline">
        {rows.length ? (
          rows.map((r) => (
            <button
              key={`${r.kind}-${r.id}`}
              onClick={() =>
                open({
                  kind: "record",
                  record: r,
                  extra: { collection: r.kind },
                })
              }
            >
              <time>{dateText(r.at, lang, true)}</time>
              <span className="timeline-dot" />
              <div>
                <strong>{t(r.kind)}</strong>
                <p>{r.description}</p>
                <small>{r.id}</small>
              </div>
            </button>
          ))
        ) : (
          <Empty />
        )}
      </div>
    </Section>
  );
}
