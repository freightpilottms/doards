const MAX_BYTES = 4_000_000;
const jsonError = (error, status) => Response.json({ error }, {
  status, headers: { "Cache-Control": "no-store" },
});

export function backendOrigin(value) {
  if (!value) throw new Error("backendNotConfigured");
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/")
    throw new Error("backendNotConfigured");
  return url.origin;
}

async function boundedBody(stream) {
  if (!stream) return undefined;
  const reader = stream.getReader(), chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error("fileTooLarge"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(bytes);
  let position = 0;
  for (const chunk of chunks) { result.set(chunk, position); position += chunk.byteLength; }
  return result;
}

// Both frontends keep same-origin cookies; only this server-side adapter knows the API origin.
export async function proxyRequest(request, options = {}) {
  let origin;
  try { origin = backendOrigin(options.origin ?? process.env.DOARDS_API_ORIGIN); }
  catch { return jsonError("backendNotConfigured", 503); }
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return jsonError("notFound", 404);
  if (!["GET", "HEAD", "POST"].includes(request.method)) return jsonError("forbidden", 405);
  if (url.origin === origin) return jsonError("backendNotConfigured", 503);
  const incomingOrigin = request.headers.get("origin");
  if (incomingOrigin) {
    try {
      if (new URL(incomingOrigin).host !== url.host) return jsonError("forbidden", 403);
    } catch { return jsonError("forbidden", 403); }
  }
  // Serverless connections are finite; the existing UI refreshes every eight seconds.
  if (url.pathname === "/api/events") return new Response(null, { status: 204 });
  if (Number(request.headers.get("content-length")) > MAX_BYTES)
    return jsonError("fileTooLarge", 413);
  const headers = new Headers({ Origin: origin });
  for (const name of ["content-type", "cookie", "x-doards-app", "authorization"])
    if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  try {
    const body = request.method === "POST" ? await boundedBody(request.body) : undefined;
    const upstream = await fetch(origin + url.pathname + url.search, {
      method: request.method, headers, body, redirect: "manual",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(options.timeoutMs ?? 25000)]),
    });
    if (upstream.status >= 300 && upstream.status < 400)
      return jsonError("backendUnavailable", 502);
    const outgoing = new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    for (const name of ["content-type", "content-disposition"])
      if (upstream.headers.has(name)) outgoing.set(name, upstream.headers.get(name));
    for (const cookie of upstream.headers.getSetCookie()) outgoing.append("set-cookie", cookie);
    const payload = request.method === "HEAD" || [204, 304].includes(upstream.status)
      ? null : await boundedBody(upstream.body);
    return new Response(payload, { status: upstream.status, headers: outgoing });
  } catch (error) {
    return error.message === "fileTooLarge"
      ? jsonError("fileTooLarge", 413) : jsonError("backendUnavailable", 502);
  }
}
