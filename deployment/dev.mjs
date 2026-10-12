import { createServer, loadEnv } from "vite";
import { Readable } from "node:stream";
import { proxyRequest } from "./proxy.mjs";

const env = { ...loadEnv("development", process.cwd(), "DOARDS_"), ...process.env };
const server = await createServer({
  server: { host: "0.0.0.0", port: Number(process.env.PORT || 5173) },
  plugins: [{
    name: "doards-api-adapter",
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        try {
          const request = new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method,
            headers: Object.fromEntries(Object.entries(req.headers).filter(([, value]) => typeof value === "string")),
            ...(req.method === "POST" ? { body: Readable.toWeb(req), duplex: "half" } : {}),
          });
          const response = await proxyRequest(request, { origin: env.DOARDS_API_ORIGIN || "" });
          res.statusCode = response.status;
          response.headers.forEach((value, name) => {
            if (name !== "set-cookie") res.setHeader(name, value);
          });
          const cookies = response.headers.getSetCookie();
          if (cookies.length) res.setHeader("Set-Cookie", cookies);
          res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
        } catch {
          res.writeHead(502, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          res.end(JSON.stringify({ error: "backendUnavailable" }));
        }
      });
    },
  }],
});
await server.listen();
server.printUrls();
if (!env.DOARDS_API_ORIGIN) console.log("Set DOARDS_API_ORIGIN in .env.local to the HTTPS backend origin, then restart. See README.md.");
