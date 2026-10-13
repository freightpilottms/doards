let handler;
export default async function api(req, res) {
  if (!process.env.DATABASE_URL) {
    res.writeHead(503, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    return res.end(JSON.stringify({ error: "databaseNotConfigured" }));
  }
  try {
    handler ||= (
      await import("../server/cloud-server.mjs")
    ).createCloudHandler();
    return await handler(req, res);
  } catch {
    res.writeHead(503, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    return res.end(JSON.stringify({ error: "databaseUnavailable" }));
  }
}
