import { useState } from "react";
import { useApp } from "./core";
import { useI18n } from "./i18n";
import { Modal, Fields, SubmitForm } from "./ui";
import { roles } from "./data";
import type { RecordData } from "./types";
export function AccessEditor({ record }: { record: RecordData }) {
  const { data, run, close } = useApp(),
    { t } = useI18n();
  const [value, set] = useState<Record<string, any>>({
    ...record,
    password: "",
    access: record.access || {},
  });
  const defaults = {
    board: !["client", "driver"].includes(value.role),
    clients: ["admin", "client", "driver"].includes(value.role),
    workshop: ["admin", "mechanic", "warehouse"].includes(value.role),
  };
  const apps = { ...defaults, ...value.access.apps };
  const resources = [
    ...new Set([
      ...(data.rolePermissions?.[value.role] || []),
      ...(apps.workshop
        ? [
            ...(data.rolePermissions?.mechanic || []),
            ...(data.rolePermissions?.warehouse || []),
          ]
        : []),
      ...(apps.clients ? data.rolePermissions?.client || [] : []),
    ]),
  ];
  const checked = (resource: string, op: string) =>
    value.access[resource]?.[op] ??
    !(
      value.role === "warehouse" &&
      ["vehicles", "workOrders", "tasks"].includes(resource) &&
      op !== "view"
    );
  return (
    <Modal title={t("userEdit")} onClose={close} wide>
      <SubmitForm
        onCancel={close}
        onSubmit={async () => {
          await run("user.update", value);
          close();
        }}
      >
        <Fields
          value={value}
          set={(next) => {
            if (next.role !== value.role)
              next.access = {
                apps: value.access.apps || {},
                clientScope: value.access.clientScope || {},
              };
            set(next);
          }}
          fields={[
            { key: "name", required: true },
            {
              key: "role",
              type: "select",
              required: true,
              options: roles.map((value) => ({ value, label: t(value) })),
            },
            {
              key: "customerId",
              label: "customer",
              type: "select",
              required:
                value.role === "client" ||
                value.access.clientScope?.view === true,
              options: data.customers.map((c) => ({
                value: c.id,
                label: c.name,
              })),
            },
            { key: "password", type: "password" },
          ]}
        />
        <h3>{t("appAccess")}</h3>
        <div className="access-apps">
          {(["board", "clients", "workshop"] as const).map((k) => (
            <label key={k}>
              <input
                type="checkbox"
                checked={apps[k]}
                onChange={(e) =>
                  set({
                    ...value,
                    access: {
                      ...value.access,
                      apps: { ...value.access.apps, [k]: e.target.checked },
                    },
                  })
                }
              />
              {t(
                k === "board"
                  ? "primaryBoard"
                  : k === "clients"
                    ? "clientsApp"
                    : "workshopApp",
              )}
            </label>
          ))}
        </div>
        {apps.clients && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={
                value.role === "client" ||
                value.access.clientScope?.view === true
              }
              disabled={value.role === "client"}
              onChange={(e) =>
                set({
                  ...value,
                  access: {
                    ...value.access,
                    clientScope: { view: e.target.checked },
                  },
                })
              }
            />
            {t("clientCompanyScope")}
          </label>
        )}
        <div className="table-scroll access-matrix">
          <table>
            <thead>
              <tr>
                <th>{t("permissions")}</th>
                {["view", "create", "edit", "cancelAction", "export"].map(
                  (k) => (
                    <th key={k}>{t(k)}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {resources
                .filter((k) => !["export", "audit"].includes(k))
                .map((resource) => (
                  <tr key={resource}>
                    <td>{t(resource)}</td>
                    {["view", "create", "edit", "cancel", "export"].map(
                      (op) => (
                        <td key={op}>
                          <input
                            type="checkbox"
                            aria-label={`${t(resource)} · ${t(op === "cancel" ? "cancelAction" : op)}`}
                            checked={checked(resource, op)}
                            disabled={resource === "finance" && op !== "view"}
                            onChange={(e) =>
                              set({
                                ...value,
                                access: {
                                  ...value.access,
                                  [resource]: {
                                    ...value.access[resource],
                                    [op]: e.target.checked,
                                  },
                                },
                              })
                            }
                          />
                        </td>
                      ),
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {value.role === "warehouse" && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={value.access.purchasePrices?.view === true}
              onChange={(e) =>
                set({
                  ...value,
                  access: {
                    ...value.access,
                    purchasePrices: { view: e.target.checked },
                  },
                })
              }
            />
            {t("costPrice")}
          </label>
        )}
      </SubmitForm>
    </Modal>
  );
}
