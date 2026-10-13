import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Car,
  KeyRound,
  Users as UsersIcon,
  Wrench,
  Package,
  ShoppingCart,
  Receipt,
  Wallet,
  FileText,
  CalendarDays,
  MessageSquare,
  MapPin,
  BarChart3,
  ShieldCheck,
  Settings as SettingsIcon,
  Bell,
  Search,
  Menu,
  LogOut,
  RefreshCw,
  X,
  AlertTriangle,
  CircleCheck,
  LoaderCircle,
  Globe,
  ClipboardCheck,
  Banknote,
  ArrowUpRight,
  Bot,
  Workflow,
} from "lucide-react";
import type { AppState, Language, View, RecordData } from "./types";
import { I18nContext, translate, useI18n } from "./i18n";
import { api, AppContext, surface, type ModalSpec } from "./core";
import { Chat, NotificationCenter } from "./Collaboration";
import {
  AppSwitcher,
  ClientHome,
  DesktopPortal,
  ClientDemoProfiles,
  PortalNavigation,
  WorkshopHome,
  WorkshopInventory,
} from "./Portals";
import { Brand, IconButton, Fields, SubmitForm, Modal, Badge } from "./ui";
import {
  Dashboard,
  PortalDashboard,
  Fleet,
  CollectionView,
  Payments,
  CalendarView,
  Messages,
  Locations,
  Settings,
  Users,
  FinanceReport,
} from "./views";
import { VehicleDetail } from "./VehicleDetail";
import {
  Editor,
  RentalWizard,
  Handover,
  InvoiceEditor,
  RecordModal,
  PrintDocument,
  ConfirmModal,
} from "./forms";
import { roles } from "./data";
import { AccessEditor } from "./AccessEditor";
import { due } from "./utils";
import { AssistantView, AutomationView } from "./Intelligence";

const nav: {
  view: View;
  icon: typeof Car;
  group: string;
  permission: string;
}[] = [
  {
    view: "dashboard",
    icon: LayoutDashboard,
    group: "operations",
    permission: "",
  },
  { view: "vehicles", icon: Car, group: "operations", permission: "vehicles" },
  {
    view: "rentals",
    icon: KeyRound,
    group: "operations",
    permission: "rentals",
  },
  {
    view: "customers",
    icon: UsersIcon,
    group: "operations",
    permission: "customers",
  },
  {
    view: "damages",
    icon: AlertTriangle,
    group: "operations",
    permission: "damages",
  },
  {
    view: "repairs",
    icon: Wrench,
    group: "operations",
    permission: "repairs",
  },
  {
    view: "services",
    icon: ClipboardCheck,
    group: "operations",
    permission: "services",
  },
  {
    view: "workOrders",
    icon: Wrench,
    group: "operations",
    permission: "workOrders",
  },
  {
    view: "articles",
    icon: Package,
    group: "operations",
    permission: "articles",
  },
  {
    view: "purchases",
    icon: ShoppingCart,
    group: "operations",
    permission: "purchases",
  },
  { view: "invoices", icon: Receipt, group: "finance", permission: "invoices" },
  { view: "payments", icon: Wallet, group: "finance", permission: "payments" },
  { view: "costs", icon: Banknote, group: "finance", permission: "costs" },
  { view: "reports", icon: BarChart3, group: "finance", permission: "finance" },
  {
    view: "documents",
    icon: FileText,
    group: "management",
    permission: "documents",
  },
  {
    view: "calendar",
    icon: CalendarDays,
    group: "management",
    permission: "tasks",
  },
  {
    view: "messages",
    icon: MessageSquare,
    group: "management",
    permission: "messages",
  },
  { view: "notifications", icon: Bell, group: "management", permission: "" },
  { view: "assistant", icon: Bot, group: "management", permission: "" },
  {
    view: "automation",
    icon: Workflow,
    group: "management",
    permission: "vehicles",
  },
  {
    view: "locations",
    icon: MapPin,
    group: "management",
    permission: "locations",
  },
  {
    view: "users",
    icon: ShieldCheck,
    group: "management",
    permission: "users",
  },
  {
    view: "settings",
    icon: SettingsIcon,
    group: "management",
    permission: "settings",
  },
];

export default function App() {
  const [wide, setWide] = useState(() => window.innerWidth > 1100);
  useEffect(() => {
    const media = matchMedia("(min-width:1101px)");
    const update = () => setWide(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  if (surface !== "board" && wide) {
    return (
      <DesktopPortal
        title={translate(
          "de",
          surface === "clients" ? "clientsApp" : "workshopApp",
        )}
      />
    );
  }
  return <Application />;
}

function Application() {
  const [lang, setLang] = useState<Language>("de");
  const t = useCallback((key: string) => translate(lang, key), [lang]);
  const [session, setSession] = useState<{
      user: unknown;
      demo: boolean;
      setup: boolean;
    } | null>(null),
    [data, setData] = useState<AppState | null>(null),
    [bootError, setBootError] = useState("");
  const [view, setView] = useState<View>("dashboard"),
    [filter, setFilter] = useState(""),
    [selected, setSelected] = useState<{ id: string; tab: string } | null>(
      null,
    ),
    [modal, setModal] = useState<ModalSpec | null>(null),
    [menu, setMenu] = useState(false),
    [search, setSearch] = useState(""),
    [connected, setConnected] = useState(true),
    [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const mutation = useRef(0),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const refresh = useCallback(async () => {
    const version = mutation.current;
    try {
      const next = await api<AppState>("state");
      if (version === mutation.current) setData(next);
      setConnected(true);
    } catch (e) {
      setConnected(false);
      if (["unauthorized", "appForbidden"].includes((e as Error).message)) {
        setData(null);
        setSession((s) => (s ? { ...s, user: null } : s));
      }
    }
  }, []);
  const bootstrap = useCallback(async () => {
    setBootError("");
    try {
      const s = await api<{ user: unknown; demo: boolean; setup: boolean }>(
        "session",
      );
      setSession(s);
      if (s.user) await refresh();
    } catch (e) {
      setBootError((e as Error).message);
    }
  }, [refresh]);
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);
  useEffect(() => {
    if (!session?.user) return;
    const events = new EventSource(`/api/events?app=${surface}`);
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    events.addEventListener("change", () => {
      clearTimeout(scheduled);
      scheduled = setTimeout(() => refresh(), 100);
    });
    events.addEventListener("ready", () => refresh());
    const id = setInterval(() => {
      if (!document.hidden) refresh();
    }, 8000);
    const visible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(id);
      clearTimeout(scheduled);
      events.close();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [session?.user, refresh]);
  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5500);
  }, []);
  const run = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      mutation.current++;
      const result = await api<{ id: string; state: AppState }>("action", {
        action,
        payload,
      });
      mutation.current++;
      setData(result.state);
      setConnected(true);
      return result.id;
    },
    [],
  );
  const close = useCallback(() => setModal(null), []);
  const go = (next: View, nextFilter = "") => {
    setView(next);
    setFilter(nextFilter);
    setSelected(null);
    setSearch("");
    setMenu(false);
  };
  const selectVehicle = (id: string, tab = "overview") => {
    setSelected({ id, tab });
    setView("vehicles");
    setSearch("");
    setMenu(false);
  };
  const can = (key: string) => data?.permissions.includes(key) ?? false;
  const languages = (
    <label className="language-select">
      <Globe size={15} />
      <select
        aria-label={t("language")}
        value={lang}
        onChange={(e) => setLang(e.target.value as Language)}
      >
        <option value="bs">Bosanski</option>
        <option value="de">Deutsch</option>
        <option value="en">English</option>
      </select>
    </label>
  );
  if (!data)
    return (
      <I18nContext.Provider value={{ lang, t }}>
        <div className="login-shell">
          <div className="login-top">
            <Brand />
            {languages}
          </div>
          {!session && !bootError ? (
            <div className="loading">
              <LoaderCircle className="spin" />
              {t("loading")}
            </div>
          ) : bootError ? (
            <div className="login-form">
              <p className="form-error">{t(bootError)}</p>
              <button className="button primary" onClick={bootstrap}>
                {t("refresh")}
              </button>
            </div>
          ) : (
            <Login
              demo={!!session?.demo}
              setup={!!session?.setup}
              onLogin={async () => {
                setView("dashboard");
                setSelected(null);
                await bootstrap();
              }}
            />
          )}
        </div>
      </I18nContext.Provider>
    );
  const alertCount = data.notifications?.filter((n) => !n.read).length || 0;
  const results =
    search.trim().length >= 2
      ? [
          "vehicles",
          "customers",
          "rentals",
          "invoices",
          "damages",
          "workOrders",
          "articles",
        ].flatMap((kind) =>
          ((data as any)[kind] as RecordData[])
            .filter((r) =>
              [
                r.id,
                r.plate,
                r.vin,
                r.name,
                r.make,
                r.model,
                r.description,
                r.number,
                r.sku,
              ]
                .join(" ")
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .slice(0, 4)
            .map((r) => ({ kind, r })),
        )
      : [];
  return (
    <I18nContext.Provider value={{ lang, t }}>
      <AppContext.Provider
        value={{
          data,
          can,
          run,
          open: setModal,
          close,
          go,
          selectVehicle,
          notify,
        }}
      >
        <div className={`app-shell ${surface !== "board" ? "portal-app" : ""}`}>
          {surface !== "board" && <PortalNavigation view={view} />}
          <aside className={`sidebar ${menu ? "mobile-open" : ""}`}>
            <button className="brand-button" onClick={() => go("dashboard")}>
              <Brand />
            </button>
            <div className="workspace-name">
              <span className="workspace-dot" />
              S&S Fahrzeugverleih<span className="workspace-code">AT</span>
            </div>
            <AppSwitcher />
            <nav>
              {["operations", "finance", "management"].map((group) => {
                const items = nav.filter(
                  (n) =>
                    n.group === group && (!n.permission || can(n.permission)),
                );
                return items.length ? (
                  <div className="nav-group" key={group}>
                    <span className="nav-label">{t(group)}</span>
                    {items.map(({ view: key, icon: Icon }) => (
                      <button
                        key={key}
                        aria-label={t(key)}
                        className={view === key ? "active" : ""}
                        onClick={() => go(key)}
                      >
                        <Icon size={17} />
                        <span>{t(key)}</span>
                        {key === "damages" &&
                          data.damages.some((d) => d.status !== "closed") && (
                            <i className="nav-count">
                              {
                                data.damages.filter(
                                  (d) => d.status !== "closed",
                                ).length
                              }
                            </i>
                          )}
                      </button>
                    ))}
                  </div>
                ) : null;
              })}
            </nav>
            <div className="sidebar-bottom">
              <div className="avatar">
                {data.user.name
                  .split(" ")
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <div>
                <strong>{data.user.name}</strong>
                <small>{t(data.user.role)}</small>
              </div>
              <IconButton
                label={t("logout")}
                onClick={async () => {
                  await api("logout", {});
                  setData(null);
                  setSession({ ...session!, user: null });
                  setModal(null);
                  setSearch("");
                }}
              >
                <LogOut size={16} />
              </IconButton>
            </div>
          </aside>
          {menu && (
            <button
              className="menu-scrim"
              aria-label={t("close")}
              onClick={() => setMenu(false)}
            />
          )}
          <div className="main-shell">
            <header className="topbar">
              <div className="mobile-menu">
                <IconButton label={t("menu")} onClick={() => setMenu(!menu)}>
                  <Menu size={20} />
                </IconButton>
              </div>
              <div className="global-search">
                <Search size={17} />
                <input
                  aria-label={t("search")}
                  placeholder={t("search")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <IconButton label={t("clear")} onClick={() => setSearch("")}>
                    <X size={15} />
                  </IconButton>
                )}
                {search.trim().length >= 2 && (
                  <div className="search-results">
                    {results.length ? (
                      results.map(({ kind, r }) => (
                        <button
                          key={kind + r.id}
                          onClick={() => {
                            setSearch("");
                            if (kind === "vehicles") selectVehicle(r.id);
                            else if (kind === "customers")
                              setModal({ kind: "customer", record: r });
                            else
                              setModal({
                                kind: "record",
                                record: r,
                                extra: { collection: kind },
                              });
                          }}
                        >
                          <span>{t(kind)}</span>
                          <strong>
                            {r.plate || r.number || r.name || r.id}
                          </strong>
                          <small>
                            {r.description ||
                              `${r.make || ""} ${r.model || ""}`}
                          </small>
                          <ArrowUpRight size={15} />
                        </button>
                      ))
                    ) : (
                      <p>{t("noResults")}</p>
                    )}
                  </div>
                )}
              </div>
              <div className="topbar-right">
                <span
                  className={`connection ${connected ? "" : "disconnected"}`}
                  title={t(connected ? "online" : "offline")}
                >
                  <i />
                  {t(connected ? "online" : "offline")}
                </span>
                {languages}
                <button
                  className="assistant-launch icon-button"
                  title={t("assistant")}
                  aria-label={t("assistant")}
                  onClick={() => go("assistant")}
                >
                  <Bot size={20} />
                </button>
                <IconButton label={t("refresh")} onClick={() => refresh()}>
                  <RefreshCw size={16} />
                </IconButton>
                <button
                  className="notification-button"
                  title={t("notifications")}
                  aria-label={t("notifications")}
                  onClick={() => go("notifications")}
                >
                  <Bell size={19} />
                  {alertCount > 0 && <i>{alertCount}</i>}
                </button>
              </div>
            </header>
            <main>
              {surface === "clients" && session?.demo && (
                <ClientDemoProfiles
                  onChange={async () => {
                    setModal(null);
                    setSelected(null);
                    setView("dashboard");
                    await bootstrap();
                  }}
                />
              )}
              <div className="breadcrumb">
                <span>DOARDS</span>
                <span>/</span>
                <strong>{t(view)}</strong>
                {session?.demo && (
                  <span className="demo-label">{t("demo")}</span>
                )}
              </div>
              {view === "dashboard" ? (
                surface === "clients" ? (
                  <ClientHome key={data.user.id} />
                ) : surface === "workshop" ? (
                  <WorkshopHome />
                ) : ["client", "driver"].includes(data.user.role) ? (
                  <PortalDashboard />
                ) : (
                  <Dashboard />
                )
              ) : view === "vehicles" ? (
                selected ? (
                  <VehicleDetail
                    key={selected.id + selected.tab}
                    id={selected.id}
                    initialTab={selected.tab}
                    back={() => setSelected(null)}
                  />
                ) : (
                  <Fleet filter={filter} />
                )
              ) : view === "assistant" ? (
                <AssistantView key={data.user.id + surface} />
              ) : view === "automation" ? (
                <AutomationView />
              ) : view === "payments" ? (
                <Payments />
              ) : view === "calendar" ? (
                <CalendarView />
              ) : view === "messages" ? (
                <Chat key={filter} initialThread={filter} />
              ) : view === "notifications" ? (
                <NotificationCenter />
              ) : view === "articles" && surface === "workshop" ? (
                <WorkshopInventory />
              ) : view === "locations" ? (
                <Locations />
              ) : view === "reports" ? (
                <FinanceReport />
              ) : view === "settings" ? (
                <Settings />
              ) : view === "users" ? (
                <Users />
              ) : (
                <CollectionView
                  key={view + filter}
                  view={view}
                  filter={filter}
                />
              )}
            </main>
            <footer className="app-footer">
              <span>
                &copy; {new Date().getFullYear()} AK Solutions | ZEDA'S Group
                LTD
              </span>
              <span className="connection">
                <i />
                {t(data.user.role)}
              </span>
            </footer>
          </div>
        </div>
        {modal &&
          (modal.kind === "access" ? (
            <AccessEditor record={modal.record!} />
          ) : modal.kind === "rental" ? (
            <RentalWizard vehicleId={modal.vehicleId} />
          ) : modal.kind === "handover" || modal.kind === "return" ? (
            <Handover
              record={modal.record!}
              returning={modal.kind === "return"}
            />
          ) : modal.kind === "invoice" ? (
            <InvoiceEditor spec={modal} />
          ) : modal.kind === "record" ? (
            <RecordModal spec={modal} />
          ) : modal.kind.startsWith("print") ? (
            <PrintDocument spec={modal} />
          ) : modal.kind === "confirm" ? (
            <ConfirmModal spec={modal} />
          ) : modal.kind === "auditDetail" ? (
            <AuditDetail record={modal.record!} close={close} />
          ) : (
            <Editor
              key={
                modal.kind + (modal.record?.id || "") + (modal.vehicleId || "")
              }
              spec={modal}
            />
          ))}
        {toast && (
          <div
            className={`toast ${toast.error ? "error" : ""}`}
            role={toast.error ? "alert" : "status"}
          >
            {toast.error ? (
              <AlertTriangle size={18} />
            ) : (
              <CircleCheck size={18} />
            )}
            <span>{t(toast.text)}</span>
            <IconButton label={t("close")} onClick={() => setToast(null)}>
              <X size={16} />
            </IconButton>
          </div>
        )}
      </AppContext.Provider>
    </I18nContext.Provider>
  );
}

function Login({
  demo,
  setup,
  onLogin,
}: {
  demo: boolean;
  setup: boolean;
  onLogin: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [value, set] = useState<Record<string, any>>({
      email: "",
      password: "",
      name: "",
    }),
    [role, setRole] = useState(
      surface === "clients"
        ? "client"
        : surface === "workshop"
          ? "mechanic"
          : "admin",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="login-form">
      <div className="login-icon">
        <ShieldCheck size={26} />
      </div>
      <h1>
        {t(
          setup
            ? "setup"
            : surface === "board"
              ? "login"
              : surface === "clients"
                ? "clientsApp"
                : "workshopApp",
        )}
      </h1>
      <p>S&S Fahrzeugverleih</p>
      <SubmitForm
        label={t(setup ? "setup" : "login")}
        onCancel={() => set({ email: "", password: "", name: "" })}
        onSubmit={async () => {
          await api(setup ? "setup" : "login", value);
          await onLogin();
        }}
      >
        <Fields
          value={value}
          set={set}
          fields={[
            ...(setup ? [{ key: "name", required: true }] : []),
            { key: "email", type: "email", required: true },
            { key: "password", type: "password", required: true },
          ]}
        />
      </SubmitForm>
      {demo && (
        <div className="demo-login">
          <div className="section-head">
            <strong>{t("demo")}</strong>
            <Badge value={role} />
          </div>
          <label>
            {t("role")}
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {roles
                .filter((r) =>
                  surface === "board"
                    ? !["client", "driver"].includes(r)
                    : surface === "clients"
                      ? ["client", "driver", "mechanic"].includes(r)
                      : ["mechanic", "warehouse"].includes(r),
                )
                .map((r) => (
                  <option value={r} key={r}>
                    {t(r)}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="button primary full-width"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("demo", { role });
                await onLogin();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <LoaderCircle className="spin" size={16} /> : null}
            {t("demoLogin")}
          </button>
          {error && <p className="form-error">{t(error)}</p>}
        </div>
      )}
    </div>
  );
}
function AuditDetail({
  record,
  close,
}: {
  record: RecordData;
  close: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal title={`${t("audit")} · ${record.recordId}`} onClose={close} wide>
      <div className="form-body">
        <p>
          {record.time} · {record.userId}
        </p>
        <h3>{t("oldValue")}</h3>
        <pre className="audit-json">{JSON.stringify(record.old, null, 2)}</pre>
        <h3>{t("newValue")}</h3>
        <pre className="audit-json">{JSON.stringify(record.new, null, 2)}</pre>
      </div>
    </Modal>
  );
}
