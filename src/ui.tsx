import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  X,
  Car,
  ArrowUpRight,
  LoaderCircle,
  Eraser,
  Upload,
  Plus,
} from "lucide-react";
import { useI18n } from "./i18n";
import { readFile } from "./utils";
import type { RecordData, Vehicle } from "./types";
export function Brand() {
  return (
    <div className="brand" aria-label="DOARDS S&S Fahrzeugverleih">
      <img src="/brand-reference.png" alt="DOARDS · S&S Fahrzeugverleih" />
    </div>
  );
}
export function Empty() {
  const { t } = useI18n();
  return <div className="empty">{t("noResults")}</div>;
}
export function Badge({ value }: { value: string }) {
  const { t } = useI18n();
  return (
    <span className={`badge status-${value}`}>
      <i />
      {t(value)}
    </span>
  );
}
export function IconButton({
  label,
  children,
  onClick,
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="icon-button"
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function AddButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="button primary" onClick={onClick}>
      <Plus size={16} />
      {label}
    </button>
  );
}
export function Section({
  title,
  children,
  action,
  className = "",
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`section ${className}`}>
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Stat({
  label,
  value,
  tone = "blue",
  onClick,
  icon,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
  onClick?: () => void;
  icon?: ReactNode;
}) {
  return (
    <button className={`stat ${tone}`} onClick={onClick} disabled={!onClick}>
      <span className="stat-top">
        {label}
        {icon}
      </span>
      <strong>{value}</strong>
      <ArrowUpRight size={16} className="stat-arrow" />
    </button>
  );
}
export function VehiclePhoto({
  vehicle,
  large = false,
}: {
  vehicle: Vehicle;
  large?: boolean;
}) {
  const { t } = useI18n();
  const photo = Object.values(vehicle.photos || {})[0];
  return photo ? (
    <img
      className={`vehicle-photo ${large ? "large" : ""}`}
      src={photo}
      alt={`${vehicle.make} ${vehicle.model}`}
    />
  ) : (
    <span
      className={`vehicle-photo placeholder ${large ? "large" : ""}`}
      title={t("noPhoto")}
    >
      <Car size={large ? 52 : 24} />
    </span>
  );
}
export type Column = {
  key: string;
  label: string;
  render?: (r: RecordData) => ReactNode;
};
export function Table({
  rows,
  columns,
  onRow,
}: {
  rows: RecordData[];
  columns: Column[];
  onRow?: (r: RecordData) => void;
}) {
  if (!rows.length) return <Empty />;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {columns.map((c, i) => (
                <td key={c.key}>
                  {i === 0 && onRow ? (
                    <button className="cell-link" onClick={() => onRow(r)}>
                      {c.render ? c.render(r) : r[c.key]}
                    </button>
                  ) : c.render ? (
                    c.render(r)
                  ) : typeof r[c.key] === "object" ? (
                    ""
                  ) : (
                    (r[c.key] ?? "—")
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const node = ref.current;
    node?.querySelector<HTMLElement>("input, select, button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = Array.from(
          node?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],canvas[tabindex]",
          ) || [],
        );
        if (!els.length) return;
        if (e.shiftKey && document.activeElement === els[0]) {
          e.preventDefault();
          els.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === els.at(-1)) {
          e.preventDefault();
          els[0].focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={ref}
      >
        <header>
          <h2 id="modal-title">{title}</h2>
          <IconButton label={t("close")} onClick={onClose}>
            <X size={20} />
          </IconButton>
        </header>
        {children}
      </div>
    </div>
  );
}
export interface Field {
  key: string;
  label?: string;
  type?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  min?: number | string;
  max?: number;
  wide?: boolean;
  step?: number | string;
  readOnly?: boolean;
}
export function Fields({
  fields,
  value,
  set,
}: {
  fields: Field[];
  value: Record<string, any>;
  set: (value: Record<string, any>) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="form-grid">
      {fields.map((f) => (
        <label
          key={f.key}
          className={`${f.wide ? "full" : ""} ${f.type === "checkbox" ? "check-label" : ""}`}
        >
          <span>
            {t(f.label || f.key)}
            {f.required ? " *" : ""}
          </span>
          {f.type === "select" ? (
            <select
              aria-label={t(f.label || f.key)}
              required={f.required}
              value={value[f.key] ?? ""}
              onChange={(e) => set({ ...value, [f.key]: e.target.value })}
            >
              {!f.options?.some((o) => o.value === "") && (
                <option value="">{t("select")}</option>
              )}
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea
              aria-label={t(f.label || f.key)}
              required={f.required}
              value={value[f.key] ?? ""}
              onChange={(e) => set({ ...value, [f.key]: e.target.value })}
            />
          ) : f.type === "checkbox" ? (
            <input
              type="checkbox"
              aria-label={t(f.label || f.key)}
              checked={!!value[f.key]}
              onChange={(e) => set({ ...value, [f.key]: e.target.checked })}
            />
          ) : (
            <input
              type={f.type || "text"}
              aria-label={t(f.label || f.key)}
              required={f.required}
              value={value[f.key] ?? ""}
              min={f.min ?? (f.type === "number" ? 0 : undefined)}
              max={f.max}
              step={f.step ?? (f.type === "number" ? "any" : undefined)}
              readOnly={f.readOnly}
              onChange={(e) => set({ ...value, [f.key]: e.target.value })}
            />
          )}
        </label>
      ))}
    </div>
  );
}
export function SubmitForm({
  onSubmit,
  children,
  onCancel,
  label,
}: {
  onSubmit: () => Promise<void>;
  children: ReactNode;
  onCancel: () => void;
  label?: string;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={busy} className="form-body">
        {children}
      </fieldset>
      {error && (
        <p role="alert" className="form-error">
          {t(error)}
        </p>
      )}
      <footer className="form-footer">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={onCancel}
        >
          {t("cancel")}
        </button>
        <button className="button primary" disabled={busy}>
          {busy && <LoaderCircle size={16} className="spin" />}
          {label || t("save")}
        </button>
      </footer>
    </form>
  );
}
export function FileInput({
  imageOnly = false,
  onFile,
  multiple = false,
}: {
  imageOnly?: boolean;
  onFile: (file: string, name: string) => void;
  multiple?: boolean;
}) {
  const { t } = useI18n();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div>
      <label className="file-input">
        <Upload size={18} />
        <span>{t(imageOnly ? "uploadPhoto" : "file")}</span>
        <input
          type="file"
          multiple={multiple}
          accept={
            imageOnly
              ? "image/png,image/jpeg,image/webp"
              : "application/pdf,image/png,image/jpeg,image/webp"
          }
          disabled={busy}
          onChange={async (e) => {
            setError("");
            setBusy(true);
            try {
              for (const f of Array.from(e.target.files || [])) {
                const data = await readFile(f, imageOnly);
                onFile(data, f.name);
              }
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
              e.target.value = "";
            }
          }}
        />
      </label>
      {busy && <LoaderCircle className="spin" size={16} />}{" "}
      {error && <p className="form-error">{t(error)}</p>}
    </div>
  );
}
export function Signature({ onChange }: { onChange: (v: string) => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  return (
    <div className="signature">
      <div className="section-head">
        <label>{t("signature")} *</label>
        <IconButton
          label={t("clear")}
          onClick={() => {
            ref.current?.getContext("2d")?.clearRect(0, 0, 800, 220);
            onChange("");
          }}
        >
          <Eraser size={16} />
        </IconButton>
      </div>
      <canvas
        ref={ref}
        width={800}
        height={220}
        aria-label={t("signature")}
        tabIndex={0}
        onPointerDown={(e) => {
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const r = e.currentTarget.getBoundingClientRect(),
            ctx = e.currentTarget.getContext("2d")!;
          ctx.beginPath();
          ctx.moveTo(
            ((e.clientX - r.left) * 800) / r.width,
            ((e.clientY - r.top) * 220) / r.height,
          );
          ctx.lineWidth = 2.5;
          ctx.lineCap = "round";
          ctx.strokeStyle = "#172536";
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const r = e.currentTarget.getBoundingClientRect(),
            ctx = e.currentTarget.getContext("2d")!;
          ctx.lineTo(
            ((e.clientX - r.left) * 800) / r.width,
            ((e.clientY - r.top) * 220) / r.height,
          );
          ctx.stroke();
        }}
        onPointerUp={(e) => {
          if (drawing.current) {
            drawing.current = false;
            onChange(e.currentTarget.toDataURL("image/png"));
          }
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />
    </div>
  );
}
