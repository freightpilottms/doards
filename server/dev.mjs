import { createApp } from "./index.mjs";
const app = process.env.DATABASE_URL
  ? await (await import("./cloud-server.mjs")).createCloudServer({ dev: true })
  : await createApp({
      dev: true,
      demo: true,
      demoLanSubnet: process.env.DOARDS_DEMO_LAN_SUBNET || "",
      dbPath: process.env.DOARDS_DB || "data/demo.sqlite",
    });
let port = Number(process.env.PORT || 5173);
const host = process.env.DOARDS_HOST || "127.0.0.1";
app.server.on("error", (e) => {
  if (e.code === "EADDRINUSE" && port < 5200) app.server.listen(++port, host);
  else throw e;
});
app.server.listen(port, host, () =>
  console.log(`DOARDS: http://${host}:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
