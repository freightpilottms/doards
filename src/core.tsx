import { createContext, useContext } from "react";
import type { AppState, RecordData, View } from "./types";
export const surface = location.pathname.startsWith("/clients")
  ? "clients"
  : location.pathname.startsWith("/workshop")
    ? "workshop"
    : "board";
export type ModalSpec = {
  kind: string;
  record?: RecordData;
  vehicleId?: string;
  extra?: Record<string, unknown>;
};
export interface AppContextValue {
  data: AppState;
  can: (key: string) => boolean;
  run: (action: string, payload?: Record<string, unknown>) => Promise<string>;
  open: (spec: ModalSpec) => void;
  close: () => void;
  go: (view: View, filter?: string) => void;
  selectVehicle: (id: string, tab?: string) => void;
  notify: (message: string, error?: boolean) => void;
}
export const AppContext = createContext<AppContextValue>(null!);
export const useApp = () => useContext(AppContext);
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "X-DOARDS-App": surface,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  }).catch(() => {
    throw new Error("offline");
  });
  const data = await response.json().catch(() => {
    throw new Error(response.status === 413 ? "fileTooLarge" : "serverError");
  });
  if (!response.ok) throw new Error(data.error || "serverError");
  return data;
}
