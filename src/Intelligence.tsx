import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Mic,
  MicOff,
  Send,
  Volume2,
  Square,
  Trash2,
  ArrowUpRight,
  RefreshCw,
  Wrench,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { api, useApp } from "./core";
import { useI18n } from "./i18n";
import { IconButton, Badge, Section, Table, Empty } from "./ui";
import { dateText, currency as money } from "./utils";
import type { RecordData, View } from "./types";
type Answer = {
  answer: string;
  mode: string;
  asOf: string;
  sources: { view: View; id: string; label: string }[];
};
type Turn = Answer & { question: string };
export function AssistantView() {
  const { t, lang } = useI18n(),
    { go, selectVehicle } = useApp();
  const [question, setQuestion] = useState(""),
    [turns, setTurns] = useState<Turn[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [configured, setConfigured] = useState(false),
    [listening, setListening] = useState(false),
    [consent, setConsent] = useState(false),
    [speaking, setSpeaking] = useState(false);
  const recognition = useRef<any>(null),
    mounted = useRef(true),
    bottom = useRef<HTMLDivElement>(null);
  const Recognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;
  const speechLang = { bs: "bs-BA", de: "de-DE", en: "en-US" }[lang];
  useEffect(() => {
    mounted.current = true;
    api<{ configured: boolean }>("assistant")
      .then((r) => {
        if (mounted.current) setConfigured(r.configured);
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
      recognition.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);
  useEffect(() => {
    recognition.current?.abort();
    setListening(false);
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, [lang]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [turns, busy]);
  const stop = () => {
    recognition.current?.abort();
    setListening(false);
  };
  useEffect(() => {
    const hide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  const listen = () => {
    if (listening) {
      stop();
      return;
    }
    if (!Recognition || !window.isSecureContext || !consent) return;
    setError("");
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    const r = new Recognition();
    recognition.current = r;
    r.lang = speechLang;
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (e: any) => {
      if (mounted.current)
        setQuestion(
          Array.from(e.results)
            .map((v: any) => v[0].transcript)
            .join(" ")
            .slice(0, 2000),
        );
    };
    r.onerror = (e: any) => {
      if (mounted.current && e.error !== "aborted")
        setError(e.error === "not-allowed" ? "voiceDenied" : "voiceFailed");
    };
    r.onend = () => {
      if (mounted.current) setListening(false);
    };
    try {
      setListening(true);
      r.start();
    } catch {
      setListening(false);
      setError("voiceFailed");
    }
  };
  const ask = async () => {
    if (!question.trim() || busy) return;
    stop();
    setError("");
    setBusy(true);
    const q = question.trim();
    try {
      const a = await api<Answer>("assistant", { question: q, lang });
      if (mounted.current) {
        setTurns((old) => [...old.slice(-19), { ...a, question: q }]);
        setQuestion("");
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const speak = (answer: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(answer);
    utterance.lang = speechLang;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DOARDS</span>
          <h1>{t("assistant")}</h1>
        </div>
        <IconButton
          label={t("clearConversation")}
          disabled={busy || !turns.length}
          onClick={() => {
            stop();
            window.speechSynthesis?.cancel();
            setSpeaking(false);
            setTurns([]);
          }}
        >
          <Trash2 size={18} />
        </IconButton>
      </div>
      <div className="assistant-status">
        <Bot size={22} />
        <strong>{t(configured ? "aiConnected" : "localAssistant")}</strong>
        <span>
          <ShieldCheck size={14} />
          {t("readOnly")}
        </span>
      </div>
      {!configured && <p className="muted">{t("aiNotConfigured")}</p>}
      <div className="assistant-conversation" aria-live="polite">
        {!turns.length && (
          <div className="assistant-topics">
            {["askFleet", "askService", "askBilling", "askStock"].map((k) => (
              <button
                className="button"
                key={k}
                onClick={() => setQuestion(t(k))}
              >
                <ArrowUpRight size={16} />
                {t(k)}
              </button>
            ))}
          </div>
        )}
        {turns.map((turn, i) => (
          <article className="assistant-turn" key={i}>
            <h3>{turn.question}</h3>
            <div className="assistant-answer">
              <p>{turn.answer}</p>
              <div className="actions">
                {turn.sources.map((s, j) => (
                  <button
                    className="button"
                    key={j}
                    onClick={() =>
                      s.view === "vehicles" ? selectVehicle(s.id) : go(s.view)
                    }
                  >
                    <ArrowUpRight size={14} />
                    {s.label}
                  </button>
                ))}
              </div>
              <footer>
                <small>
                  {t(
                    turn.mode === "ai"
                      ? "aiAnswer"
                      : turn.mode === "fallback"
                        ? "aiFallback"
                        : "verifiedLookup",
                  )}{" "}
                  · {dateText(turn.asOf, lang, true)}
                </small>
                {"speechSynthesis" in window && (
                  <IconButton
                    label={t(speaking ? "stopSpeaking" : "readAloud")}
                    onClick={() => {
                      if (speaking) {
                        window.speechSynthesis.cancel();
                        setSpeaking(false);
                      } else speak(turn.answer);
                    }}
                  >
                    {speaking ? <Square size={16} /> : <Volume2 size={16} />}
                  </IconButton>
                )}
              </footer>
            </div>
          </article>
        ))}
        {busy && <p role="status">{t("thinking")}</p>}
        <div ref={bottom} />
      </div>
      <form
        className="assistant-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <label htmlFor="assistant-question">{t("yourQuestion")}</label>
        <textarea
          id="assistant-question"
          value={question}
          maxLength={2000}
          rows={3}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={busy}
        />
        <div className="actions">
          <IconButton
            label={t(listening ? "stopListening" : "voiceInput")}
            disabled={
              busy || !Recognition || !window.isSecureContext || !consent
            }
            onClick={listen}
          >
            {listening ? <MicOff size={19} /> : <Mic size={19} />}
          </IconButton>
          {listening && <span role="status">{t("listening")}</span>}
          <button
            className="button primary"
            disabled={busy || !question.trim()}
          >
            <Send size={16} />
            {t("send")}
          </button>
        </div>
      </form>
      {!window.isSecureContext ? (
        <p className="muted">{t("voiceHttps")}</p>
      ) : !Recognition ? (
        <p className="muted">{t("voiceUnsupported")}</p>
      ) : (
        <label className="check-label voice-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              if (!e.target.checked) stop();
            }}
          />
          {t("voiceConsent")}
        </label>
      )}
      {error && (
        <p role="alert" className="error-text">
          {t(error)}
        </p>
      )}
    </>
  );
}
export function AutomationView() {
  const { t, lang } = useI18n(),
    { data, can, go, selectVehicle } = useApp();
  const [state, setState] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = () =>
    api<any>("automation")
      .then(setState)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void refresh();
  }, [data.serverTime]);
  const vehicle = (id: string) =>
    data.vehicles.find((v) => v.id === id)?.plate || id;
  return (
    <>
      <div className="page-heading">
        <h1>{t("automation")}</h1>
        <IconButton label={t("refresh")} onClick={() => void refresh()}>
          <RefreshCw size={18} />
        </IconButton>
      </div>
      {error && <p role="alert">{t(error)}</p>}
      {!state ? (
        <p>{t("loading")}</p>
      ) : (
        <>
          <div className="automation-summary">
            <div>
              <Wrench size={22} />
              <strong>{state.serviceAlerts.length}</strong>
              <span>{t("serviceWatch")}</span>
            </div>
            <div>
              <Receipt size={22} />
              <strong>{state.pending.length}</strong>
              <span>{t("monthlyPending")}</span>
            </div>
            <div>
              <ShieldCheck size={22} />
              <span>
                {t("lastCheck")}
                <br />
                {dateText(state.checkedAt, lang, true)}
              </span>
            </div>
          </div>
          {state.settings && (
            <Section title={t("monthlyBilling")}>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={state.settings.enabled}
                  disabled={busy || !can("settings:edit")}
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    const previous = state;
                    setState({
                      ...state,
                      settings: { ...state.settings, enabled },
                    });
                    setBusy(true);
                    setError("");
                    try {
                      setState(await api("automation", { enabled }));
                    } catch (e) {
                      setState(previous);
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
                {t("autoInvoiceEnabled")}
              </label>
              <p className="muted">{t("monthlyTerms")}</p>
            </Section>
          )}
          {state.billingErrors.length > 0 && (
            <div role="alert" className="automation-errors">
              {state.billingErrors.map((e: any, i: number) => (
                <p key={i}>
                  {e.rentalId} · {t(e.error)}
                </p>
              ))}
            </div>
          )}
          <Section title={t("serviceWatch")}>
            <Table
              rows={state.serviceAlerts}
              onRow={(r) => selectVehicle(r.vehicleId)}
              columns={[
                { key: "plate", label: t("vehicle") },
                { key: "kind", label: t("type"), render: (r) => t(r.kind) },
                {
                  key: "due",
                  label: t("date"),
                  render: (r) => dateText(r.due, lang),
                },
                {
                  key: "kmLeft",
                  label: t("kmRemaining"),
                  render: (r) =>
                    r.kmLeft === null ? "—" : `${r.kmLeft.toLocaleString()} km`,
                },
                {
                  key: "overdue",
                  label: t("status"),
                  render: (r) => (
                    <Badge value={r.overdue ? "overdue" : "upcoming"} />
                  ),
                },
              ]}
            />
          </Section>
          {can("finance") && (
            <>
              <Section title={t("monthlyPending")}>
                <Table
                  rows={state.pending}
                  columns={[
                    { key: "rentalId", label: t("rental") },
                    {
                      key: "vehicleId",
                      label: t("vehicle"),
                      render: (r) => vehicle(r.vehicleId),
                    },
                    {
                      key: "start",
                      label: t("start"),
                      render: (r) => dateText(r.start, lang),
                    },
                    {
                      key: "end",
                      label: t("endExclusive"),
                      render: (r) => dateText(r.end, lang),
                    },
                    { key: "days", label: t("days") },
                    {
                      key: "net",
                      label: t("net"),
                      render: (r) => money(r.net, lang),
                    },
                  ]}
                />
              </Section>
              <Section title={t("billingBalance")}>
                <Table
                  rows={state.balances}
                  columns={[
                    { key: "id", label: t("rental") },
                    {
                      key: "vehicleId",
                      label: t("vehicle"),
                      render: (r) => vehicle(r.vehicleId),
                    },
                    {
                      key: "total",
                      label: t("agreedNet"),
                      render: (r) => money(r.total, lang),
                    },
                    {
                      key: "billed",
                      label: t("invoicedNet"),
                      render: (r) => money(r.billed, lang),
                    },
                    {
                      key: "remaining",
                      label: t("remainingNet"),
                      render: (r) => money(r.remaining, lang),
                    },
                  ]}
                />
              </Section>
              <Section
                title={t("monthlyInvoices")}
                action={
                  <button className="button" onClick={() => go("invoices")}>
                    <Receipt size={16} />
                    {t("invoices")}
                  </button>
                }
              >
                <Table
                  rows={state.monthlyInvoices}
                  columns={[
                    { key: "number", label: t("invoice") },
                    {
                      key: "date",
                      label: t("date"),
                      render: (r) => dateText(r.date, lang),
                    },
                    {
                      key: "gross",
                      label: t("gross"),
                      render: (r) => money(r.gross, lang),
                    },
                    {
                      key: "status",
                      label: t("status"),
                      render: (r) => <Badge value={r.status} />,
                    },
                  ]}
                />
              </Section>
            </>
          )}
        </>
      )}
    </>
  );
}
