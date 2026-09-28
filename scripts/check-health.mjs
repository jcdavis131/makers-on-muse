/* Post-deploy check: GET <base>/api/health and fail unless storage is
   reachable. GET only; it never writes anything.

   Run: node scripts/check-health.mjs [base]   (default https://makersonmuse.com)
   Exit 0 when the response is 200 JSON with storage "reachable", else 1.
   Until Upstash is connected this fails on purpose: /api/health reports
   storage "missing" and every submission gets a 503. */
import { pathToFileURL } from "node:url";

export async function checkHealth(base, { timeoutMs = 10000 } = {}) {
  const url = String(base).replace(/\/+$/, "") + "/api/health";
  let res;
  try {
    res = await fetch(url, { method: "GET", headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    return { ok: false, url, detail: "request failed: " + (e && e.message) };
  }
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (res.status !== 200) return { ok: false, url, status: res.status, detail: "HTTP " + res.status };
  if (!body || typeof body !== "object") return { ok: false, url, status: 200, detail: "response is not JSON" };
  const storage = body.storage;
  return {
    ok: storage === "reachable",
    url,
    status: 200,
    storage,
    detail: storage === "reachable" ? "storage reachable" : "storage " + JSON.stringify(storage)
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const base = process.argv[2] || "https://makersonmuse.com";
  const r = await checkHealth(base);
  console.log((r.ok ? "OK   " : "FAIL ") + r.url + ": " + r.detail);
  process.exit(r.ok ? 0 : 1);
}
