import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  ChevronLeft,
  FileText,
  MessageSquare,
  Paperclip,
  Search,
  Send,
  X,
  ArrowUpRight,
  MapPin,
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useApp, surface } from "./core";
import { useI18n } from "./i18n";
import { Badge, Empty, IconButton, VehiclePhoto } from "./ui";
import { dateText, readFile } from "./utils";
import type { RecordData, View } from "./types";

export function NotificationCenter() {
  const { data, run, go, selectVehicle, notify } = useApp(),
    { t, lang } = useI18n();
  const [filter, setFilter] = useState("all"),
    [busy, setBusy] = useState(false);
  const rows = (data.notifications || []).filter(
    (n) => filter === "all" || !n.read,
  );
  const read = async (id?: string) => {
    setBusy(true);
    try {
      await run("notification.read", id ? { id } : { all: true });
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DOARDS</span>
          <h1>{t("notifications")}</h1>
        </div>
        <button
          className="button"
          disabled={busy || !data.notifications.some((n) => !n.read)}
          onClick={() => read()}
        >
          <CheckCheck size={16} />
          {t("markAllRead")}
        </button>
      </div>
      <div className="segmented" aria-label={t("notifications")}>
        {["all", "unread"].map((k) => (
          <button
            key={k}
            className={filter === k ? "active" : ""}
            onClick={() => setFilter(k)}
          >
            {t(k)}{" "}
            <span>
              {k === "all"
                ? data.notifications.length
                : data.notifications.filter((n) => !n.read).length}
            </span>
          </button>
        ))}
      </div>
      <div className="notification-list">
        {rows.length ? (
          rows.map((n) => (
            <article
              className={`notification-row ${n.read ? "" : "unread"}`}
              key={n.id}
            >
              <span
                className={`notification-symbol ${n.severity === "high" ? "urgent" : ""}`}
              >
                {n.view === "messages" ? (
                  <MessageSquare size={20} />
                ) : (
                  <Bell size={20} />
                )}
              </span>
              <button
                className="notification-content"
                onClick={() => {
                  void read(n.id);
                  if (n.vehicleId && n.view === "vehicles")
                    selectVehicle(n.vehicleId);
                  else
                    go(
                      n.view as View,
                      n.view === "messages"
                        ? `${n.channel || "clients"}:${n.vehicleId}`
                        : "",
                    );
                }}
              >
                <strong>{t(n.title)}</strong>
                <p>{n.body}</p>
                <time>{dateText(n.at, lang, true)}</time>
              </button>
              {!n.read && (
                <IconButton
                  label={t("markRead")}
                  onClick={() => read(n.id)}
                  disabled={busy}
                >
                  <Check size={18} />
                </IconButton>
              )}
              <ArrowUpRight size={16} />
            </article>
          ))
        ) : (
          <Empty />
        )}
      </div>
    </>
  );
}

export function Chat({ initialThread = "" }: { initialThread?: string }) {
  const { data, run, notify, can } = useApp(),
    { t, lang } = useI18n();
  const [channel, setChannel] = useState(
    surface === "workshop"
      ? "workshop"
      : initialThread.split(":")[0] || "clients",
  );
  const [vehicleId, setVehicle] = useState(
    initialThread.split(":")[1] ||
      data.vehicles.find((v) =>
        data.messages.some(
          (m) => m.vehicleId === v.id && (m.channel || "clients") === channel,
        ),
      )?.id ||
      data.vehicles[0]?.id ||
      "",
  );
  const [query, setQuery] = useState(""),
    [body, setBody] = useState(""),
    [attachments, setAttachments] = useState<{ name: string; file: string }[]>(
      [],
    ),
    [busy, setBusy] = useState(false),
    [mobileThread, setMobileThread] = useState(false);
  const list = useRef<HTMLDivElement>(null),
    file = useRef<HTMLInputElement>(null);
  const messages = data.messages
    .filter(
      (m) => m.vehicleId === vehicleId && (m.channel || "clients") === channel,
    )
    .sort((a, b) => a.at.localeCompare(b.at));
  const lastMessage = messages.at(-1)?.id;
  const receipt = data.messageReceipts.find(
    (r) =>
      r.userId === data.user.id &&
      r.vehicleId === vehicleId &&
      r.channel === channel,
  );
  const unseen = messages.some(
    (m) => m.senderId !== data.user.id && (!receipt || m.at > receipt.at),
  );
  useEffect(() => {
    list.current?.scrollTo(0, list.current.scrollHeight);
    if (vehicleId && unseen)
      run("message.read", { vehicleId, channel }).catch(() => {});
  }, [lastMessage, vehicleId, channel, unseen, run]);
  const vehicle = data.vehicles.find((v) => v.id === vehicleId);
  const choose = (id: string) => {
    setVehicle(id);
    setBody("");
    setAttachments([]);
    setMobileThread(true);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("teamInbox")}</span>
          <h1>{t("messages")}</h1>
        </div>
        <span className="live-label">
          <i />
          {t("connectedBoard")}
        </span>
      </div>
      {surface === "board" && (
        <div className="segmented">
          {["clients", "workshop"].map((k) => (
            <button
              key={k}
              className={channel === k ? "active" : ""}
              onClick={() => {
                setChannel(k);
                setBody("");
                setAttachments([]);
              }}
            >
              {t(k === "clients" ? "clientsApp" : "workshopApp")}
            </button>
          ))}
        </div>
      )}
      <div className={`chat-workspace ${mobileThread ? "thread-open" : ""}`}>
        <aside className="chat-threads">
          <label className="chat-search">
            <Search size={16} />
            <input
              aria-label={t("searchConversations")}
              placeholder={t("searchConversations")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {data.vehicles
            .filter((v) =>
              `${v.plate} ${v.make} ${v.model}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((v) => {
              const msgs = data.messages
                .filter(
                  (m) =>
                    m.vehicleId === v.id &&
                    (m.channel || "clients") === channel,
                )
                .sort((a, b) => a.at.localeCompare(b.at));
              const last = msgs.at(-1);
              const seen = data.messageReceipts.find(
                (r) =>
                  r.userId === data.user.id &&
                  r.vehicleId === v.id &&
                  r.channel === channel,
              );
              const count = msgs.filter(
                (m) => m.senderId !== data.user.id && (!seen || m.at > seen.at),
              ).length;
              return (
                <button
                  key={v.id}
                  className={`chat-thread ${vehicleId === v.id ? "selected" : ""}`}
                  onClick={() => choose(v.id)}
                >
                  <VehiclePhoto vehicle={v} />
                  <span>
                    <strong>{v.plate}</strong>
                    <small>{last?.body || `${v.make} ${v.model}`}</small>
                  </span>
                  {count > 0 && <b className="unread-count">{count}</b>}
                </button>
              );
            })}
        </aside>
        <section className="chat-conversation">
          <header>
            <span className="chat-back">
              <IconButton
                label={t("back")}
                onClick={() => setMobileThread(false)}
              >
                <ChevronLeft size={20} />
              </IconButton>
            </span>
            <div>
              <strong>{vehicle?.plate || t("select")}</strong>
              <small>
                {vehicle
                  ? `${vehicle.make} ${vehicle.model} · ${t(channel === "workshop" ? "workshopApp" : "clientsApp")}`
                  : t("messages")}
              </small>
            </div>
            <MessageSquare size={20} />
          </header>
          <div className="chat-messages" ref={list}>
            {messages.length ? (
              messages.map((m, i) => {
                const mine = m.senderId === data.user.id;
                const seen = data.messageReceipts.some(
                  (r) =>
                    r.userId !== data.user.id &&
                    r.vehicleId === vehicleId &&
                    r.channel === channel &&
                    r.at >= m.at,
                );
                return (
                  <div key={m.id}>
                    {(i === 0 ||
                      messages[i - 1].at.slice(0, 10) !==
                        m.at.slice(0, 10)) && (
                      <div className="chat-day">{dateText(m.at, lang)}</div>
                    )}
                    <div className={`chat-bubble ${mine ? "mine" : ""}`}>
                      <strong>{m.sender}</strong>
                      {m.body && <p>{m.body}</p>}
                      {m.attachments?.map((a: RecordData, j: number) => (
                        <a
                          key={j}
                          className="chat-attachment"
                          href={a.file}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <FileText size={19} />
                          <span>{a.name}</span>
                          <ArrowUpRight size={15} />
                        </a>
                      ))}
                      <footer>
                        <time>{dateText(m.at, lang, true)}</time>
                        {mine &&
                          (seen ? (
                            <CheckCheck size={14} aria-label={t("read")} />
                          ) : (
                            <Check size={14} aria-label={t("sent")} />
                          ))}
                      </footer>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="chat-empty">
                <MessageSquare size={32} />
                <strong>{vehicle?.plate}</strong>
                <span>{t("noMessages")}</span>
              </div>
            )}
          </div>
          {attachments.length > 0 && (
            <div className="attachment-strip">
              {attachments.map((a, i) => (
                <span key={i}>
                  <Paperclip size={14} />
                  {a.name}
                  <IconButton
                    label={t("remove")}
                    onClick={() =>
                      setAttachments((as) => as.filter((_, j) => j !== i))
                    }
                  >
                    <X size={14} />
                  </IconButton>
                </span>
              ))}
            </div>
          )}
          <form
            className="chat-composer"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy || (!body.trim() && !attachments.length)) return;
              setBusy(true);
              try {
                await run("message.send", {
                  vehicleId,
                  channel,
                  body,
                  attachments,
                });
                setBody("");
                setAttachments([]);
              } catch (e) {
                notify((e as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <input
              ref={file}
              className="visually-hidden"
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  if (f.size > 2_000_000) throw new Error("chatFileLimit");
                  const data = await readFile(f);
                  setAttachments((as) =>
                    [...as, { name: f.name, file: data }].slice(0, 3),
                  );
                } catch (e) {
                  notify((e as Error).message, true);
                }
              }}
            />
            <IconButton
              label={t("attachFile")}
              disabled={
                busy || attachments.length >= 3 || !can("messages:create")
              }
              onClick={() => file.current?.click()}
            >
              <Paperclip size={20} />
            </IconButton>
            <textarea
              aria-label={t("message")}
              placeholder={t("message")}
              value={body}
              maxLength={5000}
              rows={2}
              onChange={(e) => setBody(e.target.value)}
              disabled={!can("messages:create")}
            />
            <button
              className="icon-button primary"
              title={t("send")}
              aria-label={t("send")}
              disabled={
                busy ||
                !vehicleId ||
                (!body.trim() && !attachments.length) ||
                !can("messages:create")
              }
            >
              <Send size={20} />
            </button>
          </form>
        </section>
      </div>
    </>
  );
}

export function FleetMap() {
  const { data } = useApp(),
    { t, lang } = useI18n();
  const el = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false),
    focused = useRef("");
  const [selected, setSelected] = useState(""),
    [tileError, setTileError] = useState(false);
  const points = useMemo<RecordData[]>(
    () =>
      data.vehicles.flatMap((v) => {
        const p = data.locations
          .filter((l) => l.vehicleId === v.id)
          .sort((a, b) => b.at.localeCompare(a.at))[0];
        return p
          ? [
              {
                ...p,
                plate: v.plate,
                status: v.status,
                name: `${v.make} ${v.model}`,
              },
            ]
          : [];
      }),
    [data.vehicles, data.locations],
  );
  useEffect(() => {
    if (!el.current) return;
    fitted.current = false;
    focused.current = "";
    const m = L.map(el.current, {
      scrollWheelZoom: false,
      fadeAnimation: false,
      zoomAnimation: false,
    }).setView([48.2082, 16.3738], 11);
    map.current = m;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    })
      .on("tileerror", () => setTileError(true))
      .addTo(m);
    layer.current = L.layerGroup().addTo(m);
    const observer = new ResizeObserver(() =>
      m.invalidateSize({ animate: false }),
    );
    observer.observe(el.current);
    return () => {
      observer.disconnect();
      m.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);
  useEffect(() => {
    const m = map.current,
      l = layer.current;
    if (!m || !l) return;
    l.clearLayers();
    for (const p of points) {
      const text = document.createElement("div");
      text.className = "map-popup";
      text.textContent = `${p.plate} · ${t(p.source)} · ${dateText(p.at, lang, true)}`;
      const marker = L.circleMarker([p.latitude, p.longitude], {
        radius: p.vehicleId === selected ? 11 : 8,
        color: "#fff",
        weight: 3,
        fillColor: p.source === "demo" ? "#b77912" : "#147d70",
        fillOpacity: 1,
      })
        .bindPopup(text)
        .on("click", () => setSelected(p.vehicleId));
      l.addLayer(marker);
      marker.bindTooltip(p.plate, { direction: "top" });
    }
    const chosen = points.find((p) => p.vehicleId === selected);
    if (chosen && focused.current !== selected) {
      m.setView([chosen.latitude, chosen.longitude], 13, { animate: false });
      focused.current = selected;
    } else if (points.length && !fitted.current) {
      m.fitBounds(
        L.latLngBounds(
          points.map((p) => [p.latitude, p.longitude] as [number, number]),
        ),
        { padding: [40, 40], maxZoom: 12, animate: false },
      );
      fitted.current = true;
    }
  }, [points, selected, lang, t]);
  return (
    <section className="fleet-map-section">
      <div className="section-head">
        <h2>{t("fleetMap")}</h2>
        <span className="map-legend">
          <i />
          {t("lastReported")}
          <i className="demo-dot" />
          {t("demoLocation")}
        </span>
      </div>
      <div className="fleet-map-layout">
        <div className="map-canvas" ref={el} aria-label={t("fleetMap")} />
        <aside className="map-vehicles">
          {points.length ? (
            points.map((p) => (
              <button
                className={selected === p.vehicleId ? "selected" : ""}
                key={p.vehicleId}
                onClick={() => setSelected(p.vehicleId)}
              >
                <MapPin size={19} />
                <span>
                  <strong>{p.plate}</strong>
                  <small>{p.name}</small>
                  <small>{dateText(p.at, lang, true)}</small>
                </span>
                <Badge value={p.source === "demo" ? "demo" : p.status} />
              </button>
            ))
          ) : (
            <Empty />
          )}
        </aside>
      </div>
      {tileError && <p className="muted map-warning">{t("mapOffline")}</p>}
    </section>
  );
}
