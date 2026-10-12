import type { Language, RecordData } from "./types";
import { translate } from "./i18n";
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const today = () => localDate();
export const future = (n: number) =>
  localDate(new Date(Date.now() + n * 86400000));
export const days = (a: string, b: string) =>
  Math.max(1, Math.ceil((Date.parse(b) - Date.parse(a)) / 86400000));
export const locale = (l: Language) =>
  ({ bs: "hr-HR", de: "de-AT", en: "en-GB" })[l];
export const monthText = (date: Date, lang: Language, short = false) =>
  lang === "bs"
    ? short
      ? [
          "jan",
          "feb",
          "mar",
          "apr",
          "maj",
          "jun",
          "jul",
          "aug",
          "sep",
          "okt",
          "nov",
          "dec",
        ][date.getMonth()]
      : [
          "januar",
          "februar",
          "mart",
          "april",
          "maj",
          "juni",
          "juli",
          "august",
          "septembar",
          "oktobar",
          "novembar",
          "decembar",
        ][date.getMonth()] +
        " " +
        date.getFullYear()
    : new Intl.DateTimeFormat(locale(lang), {
        month: short ? "short" : "long",
        ...(short ? {} : { year: "numeric" as const }),
      }).format(date);
export const currency = (n: number, l: Language) =>
  new Intl.NumberFormat(locale(l), {
    style: "currency",
    currency: "EUR",
  }).format(n || 0);
export const dateText = (v: string, l: Language, withTime = false) =>
  v
    ? new Intl.DateTimeFormat(locale(l), {
        ...(l === "bs"
          ? {
              day: "2-digit" as const,
              month: "2-digit" as const,
              year: "numeric" as const,
              ...(withTime
                ? { hour: "2-digit" as const, minute: "2-digit" as const }
                : {}),
            }
          : {
              dateStyle: "medium" as const,
              ...(withTime ? { timeStyle: "short" as const } : {}),
            }),
      }).format(new Date(v.length === 10 ? v + "T12:00:00" : v))
    : "—";
export const due = (v: string) =>
  v
    ? Math.ceil((Date.parse(v + "T23:59:59") - Date.now()) / 86400000)
    : Infinity;
export const sum = (items: RecordData[], key: string) =>
  items.reduce((s, r) => s + Number(r[key] || 0), 0);
export function downloadCsv(
  name: string,
  rows: RecordData[],
  columns: string[],
) {
  const quote = (value: unknown) =>
    '"' +
    String(value ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const csv = [
    columns.map((key) =>
      translate(document.documentElement.lang as Language, key),
    ),
    ...rows.map((row) =>
      columns.map((key) =>
        typeof row[key] === "object" ? JSON.stringify(row[key]) : row[key],
      ),
    ),
  ]
    .map((row) => row.map(quote).join(";"))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function readFile(file: File, image = false): Promise<string> {
  if (file.size > 8 * 1024 * 1024) throw new Error("fileTooLarge");
  if (
    ![
      "image/jpeg",
      "image/png",
      "image/webp",
      ...(!image ? ["application/pdf"] : []),
    ].includes(file.type)
  )
    throw new Error("invalidFile");
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  if (!image) return raw;
  const img = new Image();
  img.src = raw;
  await img.decode();
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = img.width * scale;
  c.height = img.height * scale;
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}
