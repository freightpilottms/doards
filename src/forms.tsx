import { useState } from "react";
import {
  Plus,
  Trash2,
  Printer,
  Play,
  Square,
  Package,
  Check,
  FileText,
  PenLine,
  Wrench,
} from "lucide-react";
import { useApp, type ModalSpec } from "./core";
import { useI18n } from "./i18n";
import {
  Fields,
  SubmitForm,
  Modal,
  FileInput,
  Signature,
  Badge,
  Table,
  IconButton,
  type Field,
} from "./ui";
import {
  checklist,
  roles,
  costCategories,
  vehicleTypes,
  damageStatuses,
} from "./data";
import { today, future, currency, dateText, days } from "./utils";
import type { RecordData } from "./types";

export function Editor({ spec }: { spec: ModalSpec }) {
  const { data, run, close, can } = useApp(),
    { t, lang } = useI18n();
  const r = spec.record || { id: "" };
  const vehicleId = spec.vehicleId || r.vehicleId || "";
  const vehicleOptions = data.vehicles.map((v) => ({
    value: v.id,
    label: `${v.plate} · ${v.make} ${v.model}`,
  }));
  const customerOptions = data.customers.map((c) => ({
    value: c.id,
    label: c.company ? `${c.name} · ${c.company}` : c.name,
  }));
  const opts = (values: string[]) =>
    values.map((value) => ({ value, label: t(value) }));
  const f = (
    key: string,
    type = "text",
    required = false,
    extra: Partial<Field> = {},
  ): Field => ({ key, type, required, ...extra });
  const chooseVehicle = f("vehicleId", "select", true, {
    label: "vehicle",
    options: vehicleOptions,
  });
  const chooseCustomer = f("customerId", "select", true, {
    label: "customer",
    options: customerOptions,
  });
  const desc = f("description", "textarea", true, { wide: true });
  const common = {
    vehicleId,
    date: today(),
    due: future(7),
    tax: 20,
    ...r,
    ...spec.extra,
  };
  let fields: Field[] = [],
    action = "",
    title = "",
    initial: Record<string, any> = { ...common };
  switch (spec.kind) {
    case "vehicle":
      title = r.id ? "edit" : "newVehicle";
      action = "vehicle.save";
      initial = {
        type: "sedan",
        year: new Date().getFullYear(),
        mileage: 0,
        fuel: 100,
        dayRate: 95,
        serviceKm: 0,
        purchasePrice: 0,
        acquisitionCosts: 0,
        acquired: today(),
        ...r,
      };
      fields = [
        f("make", "text", true),
        f("model", "text", true),
        f("type", "select", true, { options: opts(vehicleTypes) }),
        f("year", "number", true, {
          label: "buildYear",
          min: 1900,
          max: new Date().getFullYear() + 2,
          step: 1,
        }),
        f("plate", "text", true),
        f("vin", "text", true),
        f("mileage", "number", true, { min: r.mileage || 0 }),
        f("fuel", "number", true, { max: 100 }),
        f("dayRate", "number", true),
        f("location", "text", true),
        f("inspectionDue", "date", true),
        f("insuranceDue", "date", true),
        f("insuranceProvider"),
        f("insurancePolicy"),
        f("insuranceBroker"),
        f("insuranceEmail", "email"),
        f("serviceDue", "date"),
        f("serviceKm", "number"),
        f("lastServiceDate", "date"),
        f("lastServiceKm", "number"),
        f("tireDate", "date"),
        f("tireType", "select", false, {
          options: opts(["summer", "winter", "allSeason"]),
        }),
        f("trackerId"),
        ...(can("finance")
          ? [
              f("purchasePrice", "number"),
              f("acquisitionCosts", "number"),
              f("acquired", "date"),
            ]
          : []),
        f("notes", "textarea", false, { wide: true }),
      ];
      break;
    case "customer":
      title = r.id ? "edit" : "newCustomer";
      action = "customer.save";
      fields = [
        f("name", "text", true),
        f("company"),
        f("email", "email"),
        f("phone"),
        f("address", "text", true, { wide: true }),
        f("license"),
        f("identity"),
      ];
      break;
    case "work":
      title = "newWork";
      action = "work.create";
      initial = {
        ...common,
        priority: "normal",
        laborCost: 38,
        laborRate: 75,
        assignedTo: data.user.role === "mechanic" ? data.user.id : "",
      };
      fields = [
        { ...chooseVehicle, required: false },
        { ...chooseCustomer, required: false },
        desc,
        f("due", "date", true),
        f("priority", "select", true, {
          options: opts(["normal", "high", "urgent"]),
        }),
        f("assignedTo", "select", false, {
          options: data.users
            .filter((u) => u.role === "mechanic")
            .map((u) => ({ value: u.id, label: u.name })),
        }),
        ...(can("finance") ? [f("laborCost", "number", true)] : []),
        f("laborRate", "number", true),
      ];
      break;
    case "time":
      title = "addTime";
      action = "work.time";
      initial = { id: r.id, hours: 1 };
      fields = [f("hours", "number", true, { min: 0.01, max: 24 })];
      break;
    case "part":
      title = "withdraw";
      action = "work.part";
      initial = { id: r.id, quantity: 1 };
      fields = [
        f("articleId", "select", true, {
          label: "article",
          options: data.articles.map((a) => ({
            value: a.id,
            label: `${a.name} · ${a.stock - a.reserved} ${t(a.unit)}`,
          })),
        }),
        f("quantity", "number", true, { min: 0.001 }),
      ];
      break;
    case "repair":
      title = "newRepair";
      action = "repair.create";
      initial = {
        ...common,
        mileage: data.vehicles.find((v) => v.id === vehicleId)?.mileage || 0,
        net: 0,
      };
      fields = [
        chooseVehicle,
        f("supplier", "text", true),
        desc,
        f("date", "date", true),
        f("mileage", "number", true),
        f("invoiceNumber"),
        ...(can("finance")
          ? [f("net", "number", true), f("tax", "number", true, { max: 100 })]
          : []),
      ];
      break;
    case "purchaseBill":
      title = "purchaseBill";
      action = "purchase.bill";
      initial = { ...r, invoiceDate: today(), paymentDate: today() };
      fields = [
        f("invoiceNumber", "text", true),
        f("invoiceDate", "date", true),
        f("paid", "checkbox"),
        f("paymentDate", "date"),
      ];
      break;
    case "service":
      title = "newService";
      action = "service.create";
      initial = {
        ...common,
        kind: "minor",
        mileage: data.vehicles.find((v) => v.id === vehicleId)?.mileage || 0,
        nextDate: future(180),
        nextKm:
          (data.vehicles.find((v) => v.id === vehicleId)?.mileage || 0) + 15000,
      };
      fields = [
        chooseVehicle,
        f("kind", "select", true, {
          options: opts([
            "major",
            "minor",
            "inspection",
            "tires",
            "brakes",
            "oil",
            "other",
          ]),
        }),
        desc,
        f("date", "date", true),
        f("mileage", "number", true),
        f("nextDate", "date", true),
        f("nextKm", "number", true),
        f("tireType", "select", false, {
          options: opts(["summer", "winter", "allSeason"]),
        }),
        f("supplier"),
        f("workOrderId", "select", false, {
          label: "workOrders",
          options: data.workOrders
            .filter((w) => !vehicleId || w.vehicleId === vehicleId)
            .map((w) => ({ value: w.id, label: `${w.id} · ${w.description}` })),
        }),
      ];
      break;
    case "damage":
      title = "newDamage";
      action = "damage.create";
      fields = [desc];
      break;
    case "damageEdit":
      title = "edit";
      action = "damage.update";
      fields = [
        f("status", "select", true, { options: opts(damageStatuses) }),
        ...(can("finance")
          ? [
              f("repairCost", "number"),
              f("insurerShare", "number"),
              f("customerShare", "number"),
            ]
          : []),
      ];
      break;
    case "article":
      title = r.id ? "edit" : "newArticle";
      action = "article.save";
      initial = {
        unit: "pcs",
        tax: 20,
        salePrice: 0,
        costPrice: 0,
        minimum: 0,
        ...r,
      };
      fields = [
        f("name", "text", true),
        f("sku", "text", true),
        f("ean"),
        f("manufacturer"),
        f("category", "select", false, {
          options: opts(["oil", "filterPart", "brakes", "tires", "other"]),
        }),
        f("unit", "select", true, { options: opts(["pcs", "set", "l"]) }),
        f("location", "text", true),
        f("minimum", "number", true),
        f("salePrice", "number", true),
        ...(can("finance") ? [f("costPrice", "number", true)] : []),
        f("tax", "number", true, { max: 100 }),
      ];
      break;
    case "stock":
      title = "stockMove";
      action = "stock.move";
      initial = { articleId: r.id, type: "inventory", quantity: 1 };
      fields = [
        f("type", "select", true, {
          options: opts(["inventory", "return", "reservation"]),
        }),
        f("quantity", "number", true, { min: -r.stock }),
        f("reason", "textarea", true, { wide: true }),
      ];
      break;
    case "purchase":
      title = "newPurchase";
      action = "purchase.create";
      initial = { ...common, quantity: 1, unitCost: 0 };
      fields = [
        f("articleId", "select", true, {
          label: "article",
          options: data.articles.map((a) => ({ value: a.id, label: a.name })),
        }),
        f("supplier", "text", true),
        f("quantity", "number", true, { min: 0.001 }),
        f("unitCost", "number", true),
        f("tax", "number", true, { max: 100 }),
        f("date", "date", true),
        f("invoiceNumber"),
      ];
      break;
    case "receive":
      title = "receive";
      action = "purchase.receive";
      initial = { id: r.id, quantity: r.quantity - r.received };
      fields = [
        f("quantity", "number", true, {
          min: 0.001,
          max: r.quantity - r.received,
        }),
      ];
      break;
    case "cost":
      title = "newCost";
      action = "cost.create";
      initial = { ...common, category: "repair", net: 0 };
      fields = [
        chooseVehicle,
        f("date", "date", true),
        f("category", "select", true, { options: opts(costCategories) }),
        f("supplier", "text", true),
        desc,
        f("net", "number", true),
        f("tax", "number", true, { max: 100 }),
      ];
      break;
    case "payment":
      title = "recordPayment";
      action = "payment.create";
      initial = {
        invoiceId: r.id,
        amount: Math.round((r.gross - r.paid) * 100) / 100,
        method: "transfer",
      };
      fields = [
        f("amount", "number", true, { min: 0.01, max: initial.amount }),
        f("method", "select", true, {
          label: "paymentMethod",
          options: opts(["transfer", "cash", "card"]),
        }),
      ];
      break;
    case "deposit":
      title = "settleDeposit";
      action = "deposit.settle";
      initial = { id: r.id, retained: 0, method: r.paymentMethod };
      fields = [
        f("retained", "number", true, { max: r.depositHeld }),
        f("method", "select", true, {
          label: "paymentMethod",
          options: opts(["transfer", "cash", "card"]),
        }),
      ];
      break;
    case "cancelInvoice":
      title = "confirmCancel";
      action = "invoice.cancel";
      initial = { id: r.id };
      fields = [f("reason", "textarea", true, { wide: true })];
      break;
    case "document":
      title = "newDocument";
      action = "document.create";
      initial = {
        ...common,
        ownerKind: "vehicles",
        ownerId: vehicleId,
        type: "registration",
        financial: false,
        shared: false,
        ...spec.extra,
      };
      fields = [
        ...(vehicleId || spec.extra?.ownerId
          ? []
          : [
              f("ownerId", "select", true, {
                label: "vehicle",
                options: vehicleOptions,
              }),
            ]),
        f("title", "text", true),
        f("type", "select", true, {
          options: opts([
            "registration",
            "insurance",
            "inspection",
            "purchase",
            "leasing",
            "serviceBook",
            "receipt",
            "other",
          ]),
        }),
        f("date", "date", true),
        f("expires", "date"),
        ...(can("finance") ? [f("financial", "checkbox")] : []),
        f("shared", "checkbox"),
      ];
      break;
    case "task":
      title = "newTask";
      action = "task.save";
      initial = { ...common, done: false };
      fields = [
        f("title", "text", true, { wide: true }),
        { ...chooseVehicle, required: false },
        f("due", "date", true),
        f("assignedTo", "select", false, {
          options: data.users.map((u) => ({ value: u.id, label: u.name })),
        }),
      ];
      break;
    case "user":
      title = "newUser";
      action = "user.create";
      initial = { role: "employee" };
      fields = [
        f("name", "text", true),
        f("email", "email", true),
        f("password", "password", true),
        f("role", "select", true, { options: opts(roles) }),
        { ...chooseCustomer, required: false },
      ];
      break;
    default:
      title = "edit";
  }
  const [value, setValue] = useState(initial);
  return (
    <Modal title={t(title)} onClose={close} wide={spec.kind === "vehicle"}>
      <SubmitForm
        onCancel={close}
        onSubmit={async () => {
          await run(action, value);
          close();
        }}
      >
        <Fields fields={fields} value={value} set={setValue} />
        {["document", "damage"].includes(spec.kind) && (
          <>
            <FileInput
              imageOnly={spec.kind === "damage"}
              onFile={(file, fileName) =>
                setValue({
                  ...value,
                  [spec.kind === "damage" ? "evidence" : "file"]: file,
                  fileName,
                })
              }
            />
            {value.fileName && <p>{value.fileName}</p>}
            {value.evidence && (
              <img
                className="evidence"
                src={value.evidence}
                alt={t("evidence")}
              />
            )}
          </>
        )}
      </SubmitForm>
    </Modal>
  );
}

export function RentalWizard({ vehicleId }: { vehicleId?: string }) {
  const { data, run, close } = useApp(),
    { t, lang } = useI18n();
  const [step, setStep] = useState(0),
    [value, set] = useState<Record<string, any>>({
      vehicleId: vehicleId || "",
      customerId: "",
      driverId: "",
      start: today(),
      end: future(3),
      rate: data.vehicles.find((v) => v.id === vehicleId)?.dayRate || 95,
      extras: 0,
      deposit: 500,
      includedKm: 600,
      extraKmRate: 0.3,
      paymentMethod: "card",
      billingMode: "monthly",
      notes: "",
    });
  const labels = ["vehicle", "customer", "period", "extras", "summary"];
  const total =
    days(value.start, value.end) * Number(value.rate) + Number(value.extras);
  const fields: Field[][] = [
    [
      {
        key: "vehicleId",
        label: "vehicle",
        type: "select",
        required: true,
        options: data.vehicles
          .filter(
            (v) => !["maintenance", "blocked", "inspection"].includes(v.status),
          )
          .map((v) => ({
            value: v.id,
            label: `${v.plate} · ${v.make} ${v.model}`,
          })),
      },
    ],
    [
      {
        key: "customerId",
        label: "customer",
        type: "select",
        required: true,
        options: data.customers.map((c) => ({ value: c.id, label: c.name })),
      },
      {
        key: "driverId",
        label: "driver",
        type: "select",
        options: [
          { value: "", label: t("none") },
          ...data.users
            .filter(
              (u) =>
                u.role === "driver" &&
                (!u.customerId || u.customerId === value.customerId),
            )
            .map((u) => ({ value: u.id, label: u.name })),
        ],
      },
    ],
    [
      { key: "start", type: "date", required: true },
      { key: "end", type: "date", required: true, min: value.start },
      { key: "rate", type: "number", required: true },
      {
        key: "billingMode",
        type: "select",
        required: true,
        options: ["monthly", "final"].map((value) => ({
          value,
          label: t(value === "final" ? "finalBilling" : "monthlyBilling"),
        })),
      },
      { key: "includedKm", type: "number", required: true },
      { key: "extraKmRate", type: "number", required: true },
    ],
    [
      { key: "extras", type: "number", required: true },
      { key: "deposit", type: "number", required: true },
      {
        key: "paymentMethod",
        type: "select",
        required: true,
        options: ["card", "cash", "transfer"].map((value) => ({
          value,
          label: t(value),
        })),
      },
      { key: "notes", type: "textarea", wide: true },
    ],
    [],
  ];
  return (
    <Modal title={t("newRental")} onClose={close}>
      <ol className="steps">
        {labels.map((l, i) => (
          <li
            className={i === step ? "current" : i < step ? "finished" : ""}
            key={l}
          >
            <span>{i < step ? <Check size={14} /> : i + 1}</span>
            {t(l)}
          </li>
        ))}
      </ol>
      <SubmitForm
        label={t(step === 4 ? "create" : "next")}
        onCancel={step ? () => setStep(step - 1) : close}
        onSubmit={async () => {
          if (step < 4) {
            if (step === 2 && value.end < value.start)
              throw new Error("invalidPeriod");
            setStep(step + 1);
          } else {
            await run("rental.create", value);
            close();
          }
        }}
      >
        <Fields
          fields={fields[step]}
          value={value}
          set={(next) => {
            if (next.vehicleId !== value.vehicleId)
              next.rate =
                data.vehicles.find((v) => v.id === next.vehicleId)?.dayRate ||
                0;
            if (next.customerId !== value.customerId) next.driverId = "";
            set(next);
          }}
        />
        {step === 4 && (
          <dl className="details">
            <dt>{t("vehicle")}</dt>
            <dd>
              {data.vehicles.find((v) => v.id === value.vehicleId)?.plate}
            </dd>
            <dt>{t("customer")}</dt>
            <dd>
              {data.customers.find((c) => c.id === value.customerId)?.name}
            </dd>
            <dt>{t("period")}</dt>
            <dd>
              {dateText(value.start, lang)} – {dateText(value.end, lang)}
            </dd>
            <dt>{t("deposit")}</dt>
            <dd>{currency(value.deposit, lang)}</dd>
          </dl>
        )}
        {step >= 2 && (
          <div className="total-line">
            <span>
              {days(value.start, value.end)} {t("days")} · {t("total")}{" "}
              {t("net")}
            </span>
            <strong>{currency(total, lang)}</strong>
          </div>
        )}
      </SubmitForm>
    </Modal>
  );
}

export function Handover({
  record,
  returning = false,
}: {
  record: RecordData;
  returning?: boolean;
}) {
  const { data, run, close } = useApp(),
    { t, lang } = useI18n(),
    v = data.vehicles.find((v) => v.id === record.vehicleId)!;
  const [value, set] = useState<Record<string, any>>({
    id: record.id,
    mileage: v.mileage,
    fuel: v.fuel,
    checks: Array(8).fill(""),
    signature: "",
    photos: [],
    notes: "",
    cleaning: 0,
    refuel: 0,
    other: 0,
  });
  const [ack, setAck] = useState(false);
  const damage = data.damages.filter(
    (d) => d.vehicleId === v.id && d.status !== "closed",
  );
  return (
    <Modal
      title={`${t(returning ? "return" : "handover")} · ${v.plate}`}
      onClose={close}
      wide
    >
      <SubmitForm
        onCancel={close}
        label={t("confirm")}
        onSubmit={async () => {
          if (!ack) throw new Error("required");
          await run(returning ? "rental.return" : "rental.handover", value);
          close();
        }}
      >
        <Fields
          fields={[
            {
              key: "mileage",
              type: "number",
              required: true,
              min: Math.max(v.mileage, record.outMileage || 0),
            },
            { key: "fuel", type: "number", required: true, max: 100 },
          ]}
          value={value}
          set={set}
        />
        <h3>
          {t("existingDamage")} ({damage.length})
        </h3>
        {damage.map((d) => (
          <div className="damage-note" key={d.id}>
            <Badge value={d.status} />
            <span>{d.description}</span>
            <small>{dateText(d.createdAt, lang, true)}</small>
          </div>
        ))}
        <label className="check-label">
          <input
            type="checkbox"
            checked={ack}
            required
            onChange={(e) => setAck(e.target.checked)}
          />
          {t("confirm")} · {t("existingDamage")}
        </label>
        <div className="checklist">
          {checklist.map((key, i) => (
            <label key={key}>
              <span>
                {i + 1}. {t(key)}
              </span>
              <select
                required
                value={value.checks[i]}
                onChange={(e) =>
                  set({
                    ...value,
                    checks: value.checks.map((v: string, j: number) =>
                      i === j ? e.target.value : v,
                    ),
                  })
                }
              >
                <option value="">{t("select")}</option>
                {["pass", "watch", "fail"].map((k) => (
                  <option key={k} value={k}>
                    {t(k)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <FileInput
          imageOnly
          multiple
          onFile={(file) =>
            set((prev) => ({
              ...prev,
              photos: [...prev.photos, file].slice(0, 8),
            }))
          }
        />
        <div className="photo-strip">
          {value.photos.map((src: string, i: number) => (
            <img key={i} src={src} alt={`${t("photos")} ${i + 1}`} />
          ))}
        </div>
        {returning && (
          <>
            <Fields
              fields={["cleaning", "refuel", "other"].map((key) => ({
                key,
                type: "number",
              }))}
              value={value}
              set={set}
            />
            <div className="total-line">
              {t("extraKm")}
              <strong>
                {Math.max(
                  0,
                  Number(value.mileage) - record.outMileage - record.includedKm,
                )}{" "}
                km
              </strong>
            </div>
          </>
        )}
        <Fields
          fields={[{ key: "notes", type: "textarea", wide: true }]}
          value={value}
          set={set}
        />
        <Signature
          onChange={(signature) => set((prev) => ({ ...prev, signature }))}
        />
      </SubmitForm>
    </Modal>
  );
}

export function InvoiceEditor({ spec }: { spec: ModalSpec }) {
  const { data, run, close } = useApp(),
    { t, lang } = useI18n();
  const [value, set] = useState<Record<string, any>>({
    customerId: "",
    due: future(14),
    rentalId: spec.extra?.rentalId || "",
    workOrderId: spec.extra?.workOrderId || "",
    lines: [
      {
        description: "",
        quantity: 1,
        price: 0,
        tax: data.settings[0]?.tax ?? 20,
        articleId: "",
      },
    ],
  });
  return (
    <Modal title={t("newInvoice")} onClose={close} wide>
      <SubmitForm
        onCancel={close}
        onSubmit={async () => {
          await run("invoice.create", value);
          close();
        }}
      >
        <Fields
          fields={[
            ...(!value.rentalId && !value.workOrderId
              ? [
                  {
                    key: "customerId",
                    label: "customer",
                    type: "select",
                    required: true,
                    options: data.customers.map((c) => ({
                      value: c.id,
                      label: c.name,
                    })),
                  },
                ]
              : []),
            { key: "due", type: "date", required: true },
          ]}
          value={value}
          set={set}
        />
        {value.rentalId || value.workOrderId ? (
          <p className="notice">
            {t("source")}: {value.rentalId || value.workOrderId}
          </p>
        ) : (
          <>
            <h3>{t("lineItems")}</h3>
            {value.lines.map((line: RecordData, i: number) => (
              <div className="invoice-line" key={i}>
                <Fields
                  fields={[
                    {
                      key: "articleId",
                      label: "article",
                      type: "select",
                      options: [
                        { value: "", label: t("other") },
                        ...data.articles.map((a) => ({
                          value: a.id,
                          label: a.name,
                        })),
                      ],
                    },
                    { key: "description", required: true },
                    {
                      key: "quantity",
                      type: "number",
                      required: true,
                      min: 0.001,
                    },
                    { key: "price", type: "number", required: true },
                    { key: "tax", type: "number", required: true, max: 100 },
                  ]}
                  value={line}
                  set={(next) => {
                    if (next.articleId !== line.articleId && next.articleId) {
                      const a = data.articles.find(
                        (a) => a.id === next.articleId,
                      )!;
                      next.description = a.name;
                      next.price = a.salePrice;
                      next.tax = a.tax;
                    }
                    set({
                      ...value,
                      lines: value.lines.map((l: RecordData, j: number) =>
                        j === i ? next : l,
                      ),
                    });
                  }}
                />
                <IconButton
                  label={t("clear")}
                  disabled={value.lines.length === 1}
                  onClick={() =>
                    set({
                      ...value,
                      lines: value.lines.filter(
                        (_: unknown, j: number) => j !== i,
                      ),
                    })
                  }
                >
                  <Trash2 size={16} />
                </IconButton>
              </div>
            ))}
            <button
              type="button"
              className="button"
              onClick={() =>
                set({
                  ...value,
                  lines: [
                    ...value.lines,
                    {
                      description: "",
                      quantity: 1,
                      price: 0,
                      tax: 20,
                      articleId: "",
                    },
                  ],
                })
              }
            >
              <Plus size={16} />
              {t("addLine")}
            </button>
            <div className="total-line">
              {t("gross")}
              <strong>
                {currency(
                  value.lines.reduce(
                    (s: number, l: RecordData) =>
                      s +
                      Number(l.quantity) *
                        Number(l.price) *
                        (1 + Number(l.tax) / 100),
                    0,
                  ),
                  lang,
                )}
              </strong>
            </div>
          </>
        )}
      </SubmitForm>
    </Modal>
  );
}

export function RecordModal({ spec }: { spec: ModalSpec }) {
  const { data, open, close, run, can, notify, selectVehicle } = useApp(),
    { t, lang } = useI18n();
  const kind = String(spec.extra?.collection || "rentals");
  const records = (data as unknown as Record<string, RecordData[]>)[kind] || [];
  const r = records.find((x) => x.id === spec.record?.id) || spec.record!;
  const cmd = async (action: string, p: Record<string, unknown>) => {
    try {
      await run(action, p);
    } catch (e) {
      notify((e as Error).message, true);
    }
  };
  return (
    <Modal title={`${r.number || r.id} · ${t(kind)}`} onClose={close} wide>
      <div className="form-body">
        <div className="record-toolbar">
          {r.vehicleId && (
            <button
              className="button"
              onClick={() => {
                close();
                selectVehicle(r.vehicleId);
              }}
            >
              {data.vehicles.find((v) => v.id === r.vehicleId)?.plate}
            </button>
          )}
          {r.status && <Badge value={r.status} />}
        </div>
        {kind === "rentals" && (
          <>
            <dl className="details">
              <dt>{t("customer")}</dt>
              <dd>
                {data.customers.find((c) => c.id === r.customerId)?.name ||
                  data.user.name}
              </dd>
              <dt>{t("period")}</dt>
              <dd>
                {dateText(r.start, lang)} – {dateText(r.end, lang)}
              </dd>
              <dt>{t("net")}</dt>
              <dd>{currency(r.total, lang)}</dd>
              <dt>{t("depositHeld")}</dt>
              <dd>{currency(r.depositHeld, lang)}</dd>
              <dt>{t("driver")}</dt>
              <dd>
                {data.users.find((u) => u.id === r.driverId)?.name || t("none")}
              </dd>
            </dl>
            <div className="actions">
              <button
                className="button"
                onClick={() => open({ kind: "printContract", record: r })}
              >
                <FileText size={16} />
                {t("contract")}
              </button>
              {["admin", "employee"].includes(data.user.role) && (
                <>
                  {r.status === "reserved" && (
                    <button
                      className="button primary"
                      onClick={() => open({ kind: "handover", record: r })}
                    >
                      {t("handover")}
                    </button>
                  )}
                  {r.status === "active" && (
                    <button
                      className="button primary"
                      onClick={() => open({ kind: "return", record: r })}
                    >
                      {t("return")}
                    </button>
                  )}
                  {r.status === "reserved" && (
                    <button
                      className="button danger"
                      onClick={() =>
                        open({
                          kind: "confirm",
                          record: r,
                          extra: { action: "rental.cancel" },
                        })
                      }
                    >
                      {t("cancelRental")}
                    </button>
                  )}
                </>
              )}
              {can("invoices:create") && r.status === "returned" && (
                <button
                  className="button"
                  onClick={() =>
                    open({ kind: "invoice", extra: { rentalId: r.id } })
                  }
                >
                  {t("newInvoice")}
                </button>
              )}
              {can("payments") &&
                r.status === "returned" &&
                r.depositHeld > 0 && (
                  <button
                    className="button"
                    onClick={() => open({ kind: "deposit", record: r })}
                  >
                    {t("settleDeposit")}
                  </button>
                )}
            </div>
            {["handover", "return"]
              .filter((key) => r[key])
              .map((key) => (
                <section key={key}>
                  <h3>{t(key)}</h3>
                  <p>
                    {dateText(r[key].at, lang, true)} · {r[key].mileage} km ·{" "}
                    {r[key].fuel}%
                  </p>
                  <p>
                    {t("existingDamage")}: {r[key].damages?.length || 0}
                  </p>
                  <div className="photo-strip">
                    {r[key].photos?.map((src: string, i: number) => (
                      <img key={i} src={src} alt={t("photos")} />
                    ))}
                  </div>
                  <img
                    className="signature-preview"
                    src={r[key].signature}
                    alt={t("signature")}
                  />
                </section>
              ))}
          </>
        )}
        {kind === "workOrders" && (
          <>
            <h3>{r.description}</h3>
            <dl className="details">
              <dt>{t("due")}</dt>
              <dd>{dateText(r.due, lang)}</dd>
              <dt>{t("assignedTo")}</dt>
              <dd>
                {data.users.find((u) => u.id === r.assignedTo)?.name || "—"}
              </dd>
              <dt>{t("hours")}</dt>
              <dd>
                {r.hours} h {r.timerAt && <Badge value="progress" />}
              </dd>
              {can("finance") && (
                <>
                  <dt>{t("laborCost")}</dt>
                  <dd>{currency(r.laborCost, lang)}</dd>
                </>
              )}
            </dl>
            {r.status !== "complete" && can("workOrders:edit") && (
              <div className="actions">
                <button
                  className="button"
                  onClick={() =>
                    cmd(r.timerAt ? "work.time" : "work.start", {
                      id: r.id,
                      stop: true,
                    })
                  }
                >
                  {r.timerAt ? <Square size={16} /> : <Play size={16} />}{" "}
                  {t(r.timerAt ? "stopTimer" : "startTimer")}
                </button>
                <button
                  className="button"
                  onClick={() => open({ kind: "time", record: r })}
                >
                  {t("addTime")}
                </button>
                <button
                  className="button"
                  onClick={() => open({ kind: "part", record: r })}
                  disabled={!can("articles:edit")}
                >
                  <Package size={16} />
                  {t("withdraw")}
                </button>
                <button
                  className="button primary"
                  onClick={() => cmd("work.complete", { id: r.id })}
                >
                  <Check size={16} />
                  {t("completeWork")}
                </button>
              </div>
            )}
            <h3>{t("parts")}</h3>
            <Table
              rows={(r.parts || []).map((p: RecordData, i: number) => ({
                ...p,
                id: String(i),
              }))}
              columns={[
                { key: "name", label: t("article") },
                { key: "quantity", label: t("quantity") },
                ...(can("finance")
                  ? [
                      {
                        key: "cost",
                        label: t("costPrice"),
                        render: (p: RecordData) =>
                          currency(p.cost * p.quantity, lang),
                      },
                    ]
                  : []),
              ]}
            />
            {r.status === "complete" && !r.vehicleId && can("invoices") && (
              <button
                className="button primary"
                onClick={() =>
                  open({ kind: "invoice", extra: { workOrderId: r.id } })
                }
              >
                {t("newInvoice")}
              </button>
            )}
          </>
        )}
        {kind === "damages" && (
          <>
            <h3>{r.description}</h3>
            <p>
              {dateText(r.createdAt, lang, true)} · {r.driver || r.createdBy}
            </p>
            <div className="damage-photo">
              <img src={r.photo} alt={t(r.angle)} />
              <span
                className="damage-pin"
                style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%` }}
              >
                !
              </span>
            </div>
            {r.evidence && (
              <img className="evidence" src={r.evidence} alt={t("evidence")} />
            )}
            <div className="actions">
              {!["driver", "client"].includes(data.user.role) && (
                <button
                  className="button"
                  onClick={() => open({ kind: "damageEdit", record: r })}
                >
                  <PenLine size={16} />
                  {t("edit")}
                </button>
              )}
              {can("workOrders") && (
                <button
                  className="button"
                  onClick={() =>
                    open({
                      kind: "work",
                      vehicleId: r.vehicleId,
                      extra: { damageId: r.id, description: r.description },
                    })
                  }
                >
                  <Wrench size={16} />
                  {t("newWork")}
                </button>
              )}
            </div>
          </>
        )}
        {kind === "invoices" && (
          <>
            <dl className="details">
              <dt>{t("customer")}</dt>
              <dd>{r.customer.name}</dd>
              <dt>{t("gross")}</dt>
              <dd>{currency(r.gross, lang)}</dd>
              <dt>{t("paidAmount")}</dt>
              <dd>{currency(r.paid, lang)}</dd>
              <dt>{t("remaining")}</dt>
              <dd>{currency(r.gross - r.paid, lang)}</dd>
            </dl>
            <div className="actions">
              <button
                className="button"
                onClick={() => open({ kind: "printInvoice", record: r })}
              >
                <Printer size={16} />
                {t("print")}
              </button>
              {r.status !== "cancelled" && r.paid < r.gross && (
                <button
                  className="button primary"
                  onClick={() => open({ kind: "payment", record: r })}
                >
                  {t("recordPayment")}
                </button>
              )}
              {data.user.role === "admin" &&
                !r.paid &&
                r.status !== "cancelled" && (
                  <button
                    className="button danger"
                    onClick={() => open({ kind: "cancelInvoice", record: r })}
                  >
                    {t("cancelInvoice")}
                  </button>
                )}
            </div>
          </>
        )}
        {!["rentals", "workOrders", "damages", "invoices"].includes(kind) && (
          <dl className="details">
            {Object.entries(r)
              .filter(
                ([key, v]) =>
                  !["id", "file", "photo", "evidence"].includes(key) &&
                  typeof v !== "object",
              )
              .map(([key, v]) => (
                <div className="detail-pair" key={key}>
                  <dt>{t(key)}</dt>
                  <dd>
                    {typeof v === "boolean"
                      ? v
                        ? t("done")
                        : t("pending")
                      : String(v)}
                  </dd>
                </div>
              ))}
          </dl>
        )}
        {kind === "purchases" && can("finance") && (
          <button
            className="button"
            onClick={() => open({ kind: "purchaseBill", record: r })}
          >
            {t("purchaseBill")}
          </button>
        )}
        {data.documents.some(
          (d) => d.ownerKind === kind && d.ownerId === r.id,
        ) && (
          <>
            <h3>{t("documents")}</h3>
            <div className="actions">
              {data.documents
                .filter((d) => d.ownerKind === kind && d.ownerId === r.id)
                .map((d) => (
                  <a
                    key={d.id}
                    className="button"
                    href={d.file}
                    download={d.fileName}
                  >
                    <FileText size={16} />
                    {d.title}
                  </a>
                ))}
            </div>
          </>
        )}
        {can("documents") &&
          [
            "workOrders",
            "damages",
            "costs",
            "purchases",
            "invoices",
            "services",
            "repairs",
          ].includes(kind) && (
            <button
              className="button"
              onClick={() =>
                open({
                  kind: "document",
                  extra: {
                    ownerKind: kind,
                    ownerId: r.id,
                    vehicleId: r.vehicleId,
                  },
                })
              }
            >
              <Plus size={16} />
              {t("receipt")}
            </button>
          )}
      </div>
    </Modal>
  );
}

export function PrintDocument({ spec }: { spec: ModalSpec }) {
  const { data, close } = useApp(),
    { t, lang } = useI18n();
  const r = spec.record!,
    invoice = spec.kind === "printInvoice",
    company = invoice ? r.company : r.contract?.company || data.settings[0],
    customer = invoice
      ? r.customer
      : r.contract?.customer ||
        data.customers.find((c) => c.id === r.customerId),
    v = r.contract?.vehicle || data.vehicles.find((v) => v.id === r.vehicleId);
  return (
    <Modal title={t(invoice ? "invoices" : "contract")} onClose={close} wide>
      <div className="print-actions">
        <button className="button primary" onClick={() => window.print()}>
          <Printer size={16} />
          {t("print")}
        </button>
      </div>
      <article className="print-sheet">
        <header>
          <div>
            <h1>DOARDS</h1>
            <strong>{company?.name}</strong>
            <p>{company?.address}</p>
            <p>
              {company?.taxId} · {company?.email}
            </p>
          </div>
          <div>
            <h2>{t(invoice ? "invoices" : "contract")}</h2>
            <strong>{r.number || r.id}</strong>
            <p>{dateText(r.date || r.start, lang)}</p>
          </div>
        </header>
        <h3>{customer?.company || customer?.name || data.user.name}</h3>
        <p>{customer?.address}</p>
        {invoice ? (
          <>
            <Table
              rows={r.lines.map((l: RecordData, i: number) => ({
                ...l,
                id: String(i),
              }))}
              columns={[
                {
                  key: "description",
                  label: t("description"),
                  render: (l) => t(l.description),
                },
                { key: "quantity", label: t("quantity") },
                {
                  key: "price",
                  label: t("price"),
                  render: (l) => currency(l.price, lang),
                },
                { key: "tax", label: t("tax") },
                {
                  key: "net",
                  label: t("net"),
                  render: (l) => currency(l.net, lang),
                },
              ]}
            />
            <dl className="details totals">
              <dt>{t("net")}</dt>
              <dd>{currency(r.net, lang)}</dd>
              <dt>{t("vat")}</dt>
              <dd>{currency(r.vat, lang)}</dd>
              <dt>{t("gross")}</dt>
              <dd>
                <strong>{currency(r.gross, lang)}</strong>
              </dd>
              <dt>{t("due")}</dt>
              <dd>{dateText(r.due, lang)}</dd>
            </dl>
            <p>IBAN: {company.iban || "—"}</p>
          </>
        ) : (
          <>
            <dl className="details">
              <dt>{t("vehicle")}</dt>
              <dd>
                {v?.make} {v?.model} · {v?.plate}
              </dd>
              <dt>{t("vin")}</dt>
              <dd>{v?.vin}</dd>
              <dt>{t("period")}</dt>
              <dd>
                {dateText(r.start, lang)} – {dateText(r.end, lang)}
              </dd>
              <dt>{t("rate")}</dt>
              <dd>{currency(r.rate, lang)}</dd>
              <dt>{t("extras")}</dt>
              <dd>{currency(r.extras, lang)}</dd>
              <dt>
                {t("total")} {t("net")}
              </dt>
              <dd>{currency(r.contract?.signedTotal ?? r.total, lang)}</dd>
              <dt>{t("billingMode")}</dt>
              <dd>
                {t(
                  (r.contract?.billingMode || r.billingMode) === "monthly"
                    ? "monthlyBilling"
                    : "finalBilling",
                )}
              </dd>
              <dt>{t("deposit")}</dt>
              <dd>{currency(r.deposit, lang)}</dd>
              <dt>{t("includedKm")}</dt>
              <dd>{r.includedKm} km</dd>
              <dt>{t("extraKmRate")}</dt>
              <dd>{currency(r.extraKmRate, lang)}</dd>
            </dl>
            <h3>{t("terms")}</h3>
            <p className="pre-wrap">{company?.terms || t("termsMissing")}</p>
            <h3>{t("existingDamage")}</h3>
            {(
              r.handover?.damages ||
              data.damages.filter(
                (d) => d.vehicleId === r.vehicleId && d.status !== "closed",
              )
            ).map((d: RecordData) => (
              <p key={d.id}>
                {d.id} · {d.description} · {dateText(d.createdAt, lang, true)}
              </p>
            ))}
            <h3>{t("signature")}</h3>
            {r.handover?.signature ? (
              <img
                className="signature-preview"
                src={r.handover.signature}
                alt={t("signature")}
              />
            ) : (
              <div className="signature-line" />
            )}
          </>
        )}
      </article>
    </Modal>
  );
}

export function ConfirmModal({ spec }: { spec: ModalSpec }) {
  const { run, close } = useApp(),
    { t } = useI18n();
  return (
    <Modal title={t("confirmCancel")} onClose={close}>
      <SubmitForm
        label={t("confirm")}
        onCancel={close}
        onSubmit={async () => {
          await run(String(spec.extra?.action), { id: spec.record?.id });
          close();
        }}
      >
        <p>{spec.record?.id}</p>
      </SubmitForm>
    </Modal>
  );
}
