import http from "node:http";
import { EventEmitter } from "node:events";
import { createHash, timingSafeEqual } from "node:crypto";
import { createPool, unitOfWork, rateLimit } from "./postgres.mjs";
import { createApp } from "./index.mjs";
import { runAutomation } from "./automation.mjs";

const MAX_BYTES = 4_000_000;
const sha = (v) => createHash("sha256").update(v).digest();
function json(res, status, error) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store",
  });
  res.end(JSON.stringify(typeof error === "string" ? { error } : error));
}
export class BufferedResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = new Map();
    this.chunks = [];
    this.bytes = 0;
  }
  setHeader(k, v) {
    this.headers.set(k.toLowerCase(), v);
  }
  writeHead(status, headers = {}) {
    this.statusCode = status;
    for (const [k, v] of Object.entries(headers)) this.setHeader(k, v);
  }
  write(chunk) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    this.bytes += b.length;
    if (this.bytes > MAX_BYTES)
      throw Object.assign(new Error("fileTooLarge"), { status: 413 });
    this.chunks.push(b);
    return true;
  }
  end(chunk) {
    if (chunk !== undefined) this.write(chunk);
    this.finished = true;
    this.emit("finish");
  }
  send(res) {
    for (const [k, v] of this.headers) res.setHeader(k, v);
    res.statusCode = this.statusCode;
    res.end(Buffer.concat(this.chunks));
  }
}

export function createCloudHandler({
  pool = createPool(),
  env = process.env,
} = {}) {
  return async (req, res) => {
    let path;
    try {
      path = new URL(req.url, "https://localhost").pathname;
      if (!path.startsWith("/api/")) return json(res, 404, "notFound");
      if (Number(req.headers["content-length"] || 0) > MAX_BYTES)
        return json(res, 413, "fileTooLarge");
      if (path === "/api/setup") return json(res, 403, "forbidden");
      if (
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      )
        return json(res, 403, "forbidden");
      if (path === "/api/cron") {
        const secret = env.CRON_SECRET;
        if (
          !secret ||
          !timingSafeEqual(
            sha(req.headers.authorization || ""),
            sha(`Bearer ${secret}`),
          )
        )
          return json(res, 401, "unauthorized");
        await unitOfWork(pool, (s) => runAutomation(s));
        await pool.query("DELETE FROM doards.rate_limits WHERE expires < $1", [
          Date.now() - 86400000,
        ]);
        return json(res, 200, { ok: true });
      }
      // Vercel terminates streams; the existing client has a polling fallback.
      if (path === "/api/events") {
        res.writeHead(204, { "Cache-Control": "no-store" });
        return res.end();
      }
      if (
        ["/api/login", "/api/demo", "/api/assistant"].includes(path) &&
        req.method === "POST"
      ) {
        // Trust the Vercel-managed header only on Vercel, not user-controlled X-Forwarded-For.
        const address = env.VERCEL
          ? req.headers["x-vercel-forwarded-for"]
          : req.socket?.remoteAddress;
        const key = createHash("sha256")
          .update(`${path}:${address || "unknown"}`)
          .digest("hex");
        if (!(await rateLimit(pool, key, path === "/api/assistant" ? 10 : 20)))
          return json(res, 429, "rateLimited");
      }
      const write = req.method !== "GET" && path !== "/api/assistant";
      const buffered = await unitOfWork(
        pool,
        async (s) => {
          const presentation =
            env.DOARDS_PRESENTATION === "1" &&
            !!s.get("meta", "presentation-only");
          const app = await createApp({
            store: s,
            demo: presentation,
            initialize: false,
            scheduler: false,
            setupEnabled: false,
            maxBodyBytes: MAX_BYTES,
            demoLoginAuthorized: (_req, user) =>
              !!user?.id?.startsWith("demo-"),
          });
          const buffer = new BufferedResponse();
          await app.handler(req, buffer);
          if (!buffer.finished) throw new Error("Incomplete response");
          // A failed business operation must never leak partial notifications or state.
          if (buffer.statusCode >= 400)
            throw Object.assign(new Error("Request rejected"), { buffer });
          return buffer;
        },
        { write },
      );
      if (env.VERCEL || env.DOARDS_SECURE_COOKIE === "1") {
        const cookies = buffered.headers.get("set-cookie");
        if (cookies)
          buffered.headers.set(
            "set-cookie",
            []
              .concat(cookies)
              .map((v) => (v.includes("; Secure") ? v : v + "; Secure")),
          );
      }
      buffered.send(res);
    } catch (e) {
      if (e.buffer) return e.buffer.send(res);
      // Never log connection strings, query values, password hashes or customer records.
      console.error("DOARDS database request failed", e.code || e.name);
      return json(
        res,
        e.status || 503,
        e.status === 413 ? "fileTooLarge" : "databaseUnavailable",
      );
    }
  };
}

export async function createCloudServer({ dev = false } = {}) {
  const pool = createPool();
  const cloud = createCloudHandler({ pool });
  const local = await createApp({
    dbPath: ":memory:",
    dev,
    initialize: false,
    scheduler: false,
    setupEnabled: false,
  });
  local.server.removeAllListeners("request");
  local.server.on("request", (req, res) =>
    req.url.startsWith("/api/") ? cloud(req, res) : local.handler(req, res),
  );
  return {
    server: local.server,
    close: async () => {
      await local.close();
      await pool.end();
    },
  };
}
