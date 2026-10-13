import http from "node:http";
import { BlockList, isIP } from "node:net";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createStore } from "./store.mjs";
import { seed, roles } from "./seed.mjs";
import { enrichDemo } from "./demo.mjs";
import {
  automationState,
  configureAutomation,
  runAutomation,
} from "./automation.mjs";
import { askAssistant, aiConfigured } from "./assistant.mjs";
import {
  execute,
  snapshot,
  DomainError,
  hashPassword,
  verifyPassword,
  authorizedMedia,
  surfaceUser,
  appAccess,
  notifyChange,
  visibleVehicleIds,
} from "./domain.mjs";

export function demoAddressAllowed(address, lanSubnet = "") {
  const ip = address?.replace(/^::ffff:/, "") || "";
  if (["127.0.0.1", "::1"].includes(ip)) return true;
  if (!lanSubnet || isIP(ip) !== 4) return false;
  const allowed = new BlockList();
  allowed.addSubnet(lanSubnet, 24, "ipv4");
  return allowed.check(ip, "ipv4");
}

export async function createApp({
  dbPath = process.env.DOARDS_DB || "data/doards.sqlite",
  demo = process.env.DOARDS_DEMO === "1",
  dev = false,
  demoLanSubnet = "",
  store,
  scheduler = true,
  initialize = true,
  setupEnabled = true,
  demoLoginAuthorized,
  publicDemo = false,
  maxBodyBytes = 24_000_000,
} = {}) {
  const s = store || createStore(dbPath);
  const initialized =
    s.db.prepare("SELECT COUNT(*) AS n FROM users").get().n > 0;
  if (initialize && !initialized && demo) {
    s.transaction(() => {
      for (const [kind, records] of Object.entries(seed()))
        for (const r of records) s.put(kind, r);
      for (const role of roles)
        s.db
          .prepare(
            "INSERT INTO users(id,email,name,role,customerId,password) VALUES(?,?,?,?,?,?)",
          )
          .run(
            `demo-${role}`,
            `${role}@doards.local`,
            {
              admin: "Admir",
              employee: "Marta Keller",
              mechanic: "Adnan Kovač",
              warehouse: "Lukas Weber",
              accountant: "Eva Berger",
              client: "Anna Müller",
              driver: "Amir Hadžić",
            }[role],
            role,
            ["client", "driver"].includes(role) ? "K-001" : "",
            hashPassword(randomBytes(32).toString("hex")),
          );
    });
  }
  if (initialize && demo) enrichDemo(s);
  const attempts = new Map();
  const streams = new Set();
  const broadcast = () => {
    for (const client of streams)
      client.res.write("event: change\ndata: {}\n\n");
  };
  if (scheduler) runAutomation(s);
  const automationTimer = scheduler
    ? setInterval(() => {
        try {
          if (runAutomation(s)) broadcast();
        } catch (e) {
          console.error("Automation failed", e.message);
        }
      }, 60000)
    : null;
  automationTimer?.unref();
  const aiLimits = new Map();
  const respond = (res, status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(data));
  };
  const body = async (req) => {
    if (req.body !== undefined) {
      const raw =
        typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      if (Buffer.byteLength(raw) > maxBodyBytes)
        throw new DomainError("fileTooLarge", 413);
      try {
        return JSON.parse(raw);
      } catch {
        throw new DomainError("invalidJson");
      }
    }
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw) > maxBodyBytes)
        throw new DomainError("fileTooLarge", 413);
    }
    try {
      return JSON.parse(raw || "{}");
    } catch {
      throw new DomainError("invalidJson");
    }
  };
  const tokenHash = (t) => createHash("sha256").update(t).digest("hex");
  const cookieFor = (req) => {
    const app =
      req.headers["x-doards-app"] ||
      new URL(req.url, "http://localhost").searchParams.get("app");
    const cookies = (req.headers.cookie || "").split(";").map((x) => x.trim());
    const scoped =
      demo && ["board", "clients", "workshop"].includes(app)
        ? `doards_demo_${app}`
        : "";
    const name =
      scoped && cookies.some((x) => x.startsWith(scoped + "="))
        ? scoped
        : "doards_session";
    return {
      name,
      token: cookies
        .find((x) => x.startsWith(name + "="))
        ?.slice(name.length + 1),
    };
  };
  const userFor = (req) => {
    const raw = cookieFor(req).token;
    return raw
      ? s.db
          .prepare(
            "SELECT users.* FROM sessions JOIN users ON users.id=sessions.userId WHERE token=? AND expires>?",
          )
          .get(tokenHash(raw), Date.now())
      : null;
  };
  const session = (res, u, name = "doards_session", sharedAlias = false) => {
    const token = randomBytes(32).toString("hex");
    s.db
      .prepare("INSERT INTO sessions(token,userId,expires) VALUES(?,?,?)")
      .run(tokenHash(token), u.id, Date.now() + 12 * 3600000);
    res.setHeader(
      "Set-Cookie",
      [name, ...(sharedAlias ? ["doards_session"] : [])].map(
        (key) =>
          `${key}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${process.env.DOARDS_SECURE_COOKIE === "1" ? "; Secure" : ""}`,
      ),
    );
  };
  let vite = null;
  const handler = async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname.startsWith("/api/")) {
        const requestedSurface =
          req.headers["x-doards-app"] ||
          url.searchParams.get("app") ||
          undefined;
        if (req.headers.origin) {
          const origin = new URL(req.headers.origin);
          if (origin.host !== req.headers.host)
            throw new DomainError("forbidden", 403);
        }
        if (url.pathname === "/api/session" && req.method === "GET") {
          const u = userFor(req);
          return respond(res, 200, {
            user: u
              ? {
                  id: u.id,
                  name: u.name,
                  role: u.role,
                  email: u.email,
                  customerId: u.customerId,
                  apps: appAccess(u),
                }
              : null,
            demo: demo && (!demoLoginAuthorized || !!u),
            publicDemo: demo && publicDemo,
            setup:
              setupEnabled &&
              s.db.prepare("SELECT COUNT(*) AS n FROM users").get().n === 0,
          });
        }
        if (
          req.method === "POST" &&
          ["/api/login", "/api/demo", "/api/setup"].includes(url.pathname)
        ) {
          const ip = req.socket.remoteAddress,
            limit = attempts.get(ip) || { count: 0, reset: Date.now() + 60000 };
          if (limit.reset < Date.now()) {
            limit.count = 0;
            limit.reset = Date.now() + 60000;
          }
          limit.count++;
          attempts.set(ip, limit);
          if (limit.count > 20) throw new DomainError("rateLimited", 429);
          const p = await body(req);
          let u;
          if (url.pathname === "/api/demo") {
            if (
              !demo ||
              !roles.includes(p.role) ||
              !(demoLoginAuthorized
                ? demoLoginAuthorized(req, userFor(req))
                : demoAddressAllowed(ip, dev ? demoLanSubnet : ""))
            )
              throw new DomainError("forbidden", 403);
            u = s.db
              .prepare("SELECT * FROM users WHERE id=?")
              .get(`demo-${p.role}`);
          } else if (url.pathname === "/api/setup") {
            if (!setupEnabled) throw new DomainError("forbidden", 403);
            if (s.db.prepare("SELECT COUNT(*) AS n FROM users").get().n)
              throw new DomainError("forbidden", 403);
            if (!p.name || !p.email || String(p.password || "").length < 12)
              throw new DomainError("passwordShort");
            s.transaction(() => {
              s.db
                .prepare(
                  "INSERT INTO users(id,email,name,role,customerId,password) VALUES(?,?,?,?,?,?)",
                )
                .run(
                  "admin",
                  String(p.email).toLowerCase(),
                  String(p.name),
                  "admin",
                  "",
                  hashPassword(p.password),
                );
              s.put("settings", {
                id: "company",
                name: "S&S Fahrzeugverleih",
                address: "",
                taxId: "",
                email: "",
                iban: "",
                terms: "",
                tax: 20,
                invoicePrefix: "RE",
                currency: "EUR",
              });
            });
            u = s.db.prepare("SELECT * FROM users WHERE id=?").get("admin");
          } else {
            u = s.db
              .prepare("SELECT * FROM users WHERE email=?")
              .get(String(p.email || "").toLowerCase());
            if (!u || !verifyPassword(String(p.password || ""), u.password))
              throw new DomainError("invalidLogin", 401);
          }
          if (!u) throw new DomainError("invalidLogin", 401);
          surfaceUser(u, requestedSurface);
          // Demo personas are independent across the board and mobile portals.
          const scopedDemo = url.pathname === "/api/demo" && requestedSurface;
          const sharedToken = (req.headers.cookie || "")
            .split(";")
            .map((x) => x.trim())
            .find((x) => x.startsWith("doards_session="))
            ?.slice(15);
          const sharedSession = sharedToken
            ? s.db
                .prepare(
                  "SELECT userId FROM sessions WHERE token=? AND expires>?",
                )
                .get(tokenHash(sharedToken), Date.now())
            : null;
          session(
            res,
            u,
            scopedDemo
              ? `doards_demo_${requestedSurface}`
              : cookieFor(req).name,
            !!scopedDemo && (!sharedSession || sharedSession.userId === u.id),
          );
          return respond(res, 200, { ok: true });
        }
        if (url.pathname === "/api/telemetry" && req.method === "POST") {
          const expected = process.env.DOARDS_GPS_TOKEN,
            provided = req.headers.authorization?.replace(/^Bearer /, "");
          if (
            !expected ||
            !provided ||
            !timingSafeEqual(
              createHash("sha256").update(expected).digest(),
              createHash("sha256").update(provided).digest(),
            )
          )
            throw new DomainError("unauthorized", 401);
          const record = execute(
            s,
            { id: "gps-adapter", name: "GPS", role: "admin" },
            "location.ingest",
            await body(req),
          );
          broadcast();
          return respond(res, 200, { id: record.id });
        }
        const baseUser = userFor(req);
        if (!baseUser) throw new DomainError("unauthorized", 401);
        const u = surfaceUser(baseUser, requestedSurface);
        if (url.pathname === "/api/assistant" && req.method === "GET")
          return respond(res, 200, { configured: aiConfigured() });
        if (url.pathname === "/api/assistant" && req.method === "POST") {
          const now = Date.now(),
            limit = aiLimits.get(u.id);
          if (limit && now - limit.at < 60000 && limit.count >= 10)
            throw new DomainError("rateLimited", 429);
          for (const [id, value] of aiLimits)
            if (now - value.at >= 60000) aiLimits.delete(id);
          aiLimits.set(u.id, {
            at: limit && now - limit.at < 60000 ? limit.at : now,
            count: limit && now - limit.at < 60000 ? limit.count + 1 : 1,
          });
          const scope = JSON.stringify([...visibleVehicleIds(s, u)].sort());
          const result = await askAssistant(s, u, await body(req));
          const fresh = userFor(req);
          if (
            !fresh ||
            fresh.access !== baseUser.access ||
            fresh.role !== baseUser.role ||
            fresh.customerId !== baseUser.customerId ||
            scope !==
              JSON.stringify(
                [
                  ...visibleVehicleIds(s, surfaceUser(fresh, requestedSurface)),
                ].sort(),
              )
          )
            throw new DomainError("unauthorized", 401);
          return respond(res, 200, result);
        }
        if (url.pathname === "/api/automation" && req.method === "GET")
          return respond(res, 200, automationState(s, u));
        if (url.pathname === "/api/automation" && req.method === "POST") {
          configureAutomation(s, u, await body(req));
          runAutomation(s);
          broadcast();
          return respond(res, 200, automationState(s, u));
        }
        if (url.pathname === "/api/events" && req.method === "GET") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          });
          res.write("event: ready\ndata: {}\n\n");
          const client = { res };
          streams.add(client);
          const heartbeat = setInterval(() => {
            try {
              const fresh = userFor(req);
              if (!fresh) throw new Error();
              surfaceUser(fresh, requestedSurface);
              res.write(": heartbeat\n\n");
            } catch {
              res.end();
            }
          }, 15000);
          res.on("close", () => {
            clearInterval(heartbeat);
            streams.delete(client);
          });
          return;
        }
        if (req.method === "GET" && url.pathname.startsWith("/api/media/")) {
          const [, , , kind, id] = url.pathname.split("/");
          const file = authorizedMedia(
            s,
            u,
            kind,
            decodeURIComponent(id),
            url.searchParams.get("path") || "",
          );
          res.writeHead(200, {
            "Content-Type": file.type,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            ...(file.name
              ? {
                  "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
                }
              : {}),
          });
          return res.end(file.buffer);
        }
        if (url.pathname === "/api/logout" && req.method === "POST") {
          s.db.prepare("DELETE FROM sessions WHERE userId=?").run(u.id);
          res.setHeader(
            "Set-Cookie",
            `${cookieFor(req).name}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
          );
          return respond(res, 200, { ok: true });
        }
        if (url.pathname === "/api/state" && req.method === "GET")
          return respond(res, 200, snapshot(s, u));
        if (url.pathname === "/api/action" && req.method === "POST") {
          const p = await body(req);
          const result = execute(s, u, p.action, p.payload);
          notifyChange(s, u, p.action, result);
          if (!["notification.read", "message.read"].includes(p.action))
            runAutomation(s);
          if (p.action !== "notification.read") broadcast();
          return respond(res, 200, { id: result?.id, state: snapshot(s, u) });
        }
        throw new DomainError("notFound", 404);
      }
      if (vite) return vite.middlewares(req, res);
      const root = resolve("dist"),
        path = resolve(root, "." + decodeURIComponent(url.pathname));
      if (!path.startsWith(root + sep) && path !== root) {
        res.writeHead(403);
        return res.end();
      }
      const file =
        existsSync(path) && extname(path) ? path : resolve(root, "index.html");
      if (!existsSync(file)) {
        res.writeHead(503);
        return res.end("Run npm run build.");
      }
      const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".webmanifest": "application/manifest+json",
      };
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control":
          extname(file) === ".html" ? "no-cache" : "public, max-age=3600",
      });
      res.end(readFileSync(file));
    } catch (e) {
      if (!(e instanceof DomainError)) console.error(e);
      respond(res, e.status || 500, {
        error: e instanceof DomainError ? e.message : "serverError",
      });
    }
  };
  const server = http.createServer(handler);
  if (dev)
    vite = await (
      await import("vite")
    ).createServer({
      server: { middlewareMode: true, hmr: { server } },
      appType: "spa",
    });
  return {
    server,
    handler,
    store: s,
    close: async () => {
      clearInterval(automationTimer);
      for (const client of streams) client.res.end();
      await vite?.close();
      await new Promise((resolve) => server.close(resolve));
      s.db.close();
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const app = process.env.DATABASE_URL
    ? await (await import("./cloud-server.mjs")).createCloudServer()
    : await createApp();
  const host = process.env.DOARDS_HOST || "127.0.0.1";
  if (process.env.DOARDS_DEMO === "1" && host !== "127.0.0.1")
    throw new Error("Demo mode must bind to loopback.");
  app.server.listen(Number(process.env.PORT || 4319), host, () =>
    console.log(`DOARDS: http://${host}:${process.env.PORT || 4319}`),
  );
}
