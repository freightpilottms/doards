export type Language = "bs" | "de" | "en";
export type Surface = "board" | "clients" | "workshop";
export type Role =
  | "admin"
  | "employee"
  | "mechanic"
  | "warehouse"
  | "accountant"
  | "client"
  | "driver";
export interface User {
  id: string;
  name: string;
  role: Role;
  email?: string;
  customerId?: string;
  access?: Record<string, Record<string, boolean>>;
  apps?: Record<Surface, boolean>;
  surface?: Surface;
  baseRole?: Role;
}
// Auxiliary records follow the server's command-specific JSON schemas.
export interface RecordData {
  id: string;
  [key: string]: any;
}
export interface Vehicle extends RecordData {
  make: string;
  model: string;
  plate: string;
  vin: string;
  year: number;
  type: string;
  status: string;
  location: string;
  mileage: number;
  fuel: number;
  dayRate: number;
  inspectionDue: string;
  insuranceDue: string;
  serviceDue: string;
  serviceKm: number;
  insuranceProvider: string;
  insuranceBroker: string;
  insuranceEmail: string;
  insurancePolicy: string;
  photos: Record<string, string>;
  notes: string;
}
export interface AppState {
  user: User;
  permissions: string[];
  serverTime: string;
  vehicles: Vehicle[];
  users: User[];
  customers: RecordData[];
  rentals: RecordData[];
  damages: RecordData[];
  workOrders: RecordData[];
  articles: RecordData[];
  purchases: RecordData[];
  invoices: RecordData[];
  payments: RecordData[];
  costs: RecordData[];
  services: RecordData[];
  repairs: RecordData[];
  documents: RecordData[];
  tasks: RecordData[];
  messages: RecordData[];
  notifications: RecordData[];
  messageReceipts: RecordData[];
  locations: RecordData[];
  movements: RecordData[];
  settings: RecordData[];
  audit: RecordData[];
  rolePermissions?: Record<string, string[]>;
}
export type View =
  | "assistant"
  | "automation"
  | "dashboard"
  | "vehicles"
  | "rentals"
  | "customers"
  | "damages"
  | "services"
  | "repairs"
  | "workOrders"
  | "articles"
  | "purchases"
  | "invoices"
  | "payments"
  | "costs"
  | "documents"
  | "calendar"
  | "messages"
  | "notifications"
  | "locations"
  | "reports"
  | "users"
  | "settings";
