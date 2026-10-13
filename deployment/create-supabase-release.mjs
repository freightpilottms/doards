import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const target = resolve(root, "release", "DOARDS-Supabase");
if (existsSync(target))
  throw new Error(
    "Release already exists; use a new destination rather than overwrite user files.",
  );
mkdirSync(target, { recursive: true });
for (const folder of ["src", "server", "tests", "public", "api", "supabase"])
  cpSync(join(root, folder), join(target, folder), {
    recursive: true,
    filter: (p) =>
      relative(root, p).replaceAll("\\", "/") !== "public/test.png",
  });
for (const file of [
  "package.json",
  "package-lock.json",
  "index.html",
  "tsconfig.json",
  "tsconfig.node.json",
  "vite.config.ts",
  "vercel.json",
  ".env.supabase.example",
  "SUPABASE_SETUP.md",
])
  cpSync(join(root, file), join(target, file));
cpSync(join(root, "SUPABASE_SETUP.md"), join(target, "README.md"));
mkdirSync(join(target, "deployment"));
for (const file of [
  "prepare-supabase.mjs",
  "create-supabase-release.mjs",
  "build-brand-icons.mjs",
])
  cpSync(join(root, "deployment", file), join(target, "deployment", file));
mkdirSync(join(target, "deployment/release-template/deployment"), {
  recursive: true,
});
for (const file of ["dev.mjs", "proxy.mjs"])
  cpSync(
    join(root, "deployment/release-template/deployment", file),
    join(target, "deployment/release-template/deployment", file),
  );
writeFileSync(
  join(target, ".gitignore"),
  "node_modules/\ndist/\ndata/\ntmp/\nrelease/\n.env\n.env.*\n!.env.*.example\n*.log\n",
);
writeFileSync(
  join(target, ".stackblitzrc"),
  JSON.stringify({ startCommand: "npm run dev:stackblitz" }, null, 2) + "\n",
);
const hashes = [];
function inspect(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) inspect(path);
    else
      hashes.push({
        path: relative(target, path).replaceAll("\\", "/"),
        sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
      });
  }
}
inspect(target);
writeFileSync(
  join(target, "RELEASE-MANIFEST.json"),
  JSON.stringify(
    {
      product: "DOARDS",
      database: "Supabase PostgreSQL",
      createdAt: new Date().toISOString(),
      dataIncluded: false,
      secretsIncluded: false,
      files: hashes,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Created ${target}; ${hashes.length} files, no database, sessions or secrets.`,
);
