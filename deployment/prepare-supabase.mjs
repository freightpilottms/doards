import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
const path = ".env.supabase";
if (existsSync(path)) {
  console.log(
    ".env.supabase already exists. No settings or secrets were overwritten.",
  );
} else {
  let value = readFileSync(".env.supabase.example", "utf8")
    .replace(/^DATABASE_URL=.*$/m, "DATABASE_URL=")
    .replace(
      /^DOARDS_ADMIN_EMAIL=.*$/m,
      "DOARDS_ADMIN_EMAIL=owner@doards.local",
    );
  for (const key of [
    "DOARDS_ADMIN_PASSWORD",
    "DOARDS_DEMO_PASSWORD",
    "CRON_SECRET",
  ])
    value = value.replace(
      new RegExp(`^${key}=.*$`, "m"),
      `${key}=${randomBytes(24).toString("base64url")}`,
    );
  writeFileSync(path, value, { flag: "wx", mode: 0o600 });
  console.log(
    "Created private .env.supabase with generated passwords. Paste only your Supabase Transaction pooler URI into DATABASE_URL. Do not commit this file or share its contents.",
  );
}
