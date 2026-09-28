/* Shared helpers for the Makers on Muse serverless API. Not a route
   (underscore prefix) — Vercel skips api/_*.js. CommonJS.

   Storage is Upstash Redis through @upstash/redis. It is configured by
   either env pair, whichever the Vercel Marketplace integration sets:
     UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or
     KV_REST_API_URL + KV_REST_API_TOKEN.
   With neither pair set, getStore() returns null and every write path
   answers 503 "storage unavailable". Nothing fakes success.

   Every key has a TTL. See README.md, "Storage". */

"use strict";

var crypto = require("crypto");

var Redis = null;
var Ratelimit = null;
try { Redis = require("@upstash/redis").Redis; } catch (e) { Redis = null; }
try { Ratelimit = require("@upstash/ratelimit").Ratelimit; } catch (e) { Ratelimit = null; }

var MAX_BODY_BYTES = 64 * 1024;
var RUN_TTL_S = 30 * 24 * 60 * 60;

/* ---------- storage ---------- */

var KEYS = {
  sub: function (code) { return "mom:sub:" + code; },
  board: function (packId) { return "mom:board:" + packId; },
  handle: function (packId, handleKey) { return "mom:handle:" + packId + ":" + handleKey; },
  token: function (hash) { return "mom:tok:" + hash; },
  runEvents: function (id) { return "mom:run:" + id + ":events"; },
  runSeq: function (id) { return "mom:run:" + id + ":seq"; },
  runMeta: function (id) { return "mom:run:" + id + ":meta"; },
  runsCurrent: "mom:runs:current"
};

function storeConfigured() {
  var e = process.env;
  return Boolean((e.UPSTASH_REDIS_REST_URL || e.KV_REST_API_URL) &&
    (e.UPSTASH_REDIS_REST_TOKEN || e.KV_REST_API_TOKEN));
}

var client = null;

/* The Redis client, or null when storage isn't configured. Never builds
   a client from missing env vars: that client would retry each command
   and hang every request before failing. */
function getStore() {
  if (!Redis || !storeConfigured()) return null;
  if (!client) {
    client = Redis.fromEnv({
      enableTelemetry: false,
      enableAutoPipelining: false,
      retry: { retries: 1, backoff: function () { return 100; } },
      signal: function () { return AbortSignal.timeout(2500); }
    });
  }
  return client;
}

/* Tests only: drop the cached client and limiters after changing env. */
function resetStore() {
  client = null;
  limiters = {};
}

/* "missing" (not configured), "reachable" (PING answered) or
   "unreachable" (configured, but PING failed). */
async function storeStatus() {
  var store = getStore();
  if (!store) return "missing";
  try {
    var pong = await store.ping();
    return pong === "PONG" ? "reachable" : "unreachable";
  } catch (e) {
    return "unreachable";
  }
}

/* ---------- clock (tests replace it) ---------- */

var clock = function () { return Date.now(); };
function now() { return clock(); }
function setClock(fn) { clock = fn || function () { return Date.now(); }; }

/* ---------- responses ---------- */

/* JSON response. Cache-Control defaults to no-store (a submit response
   carries a secret token); pass headers to override. */
function json(res, status, obj, headers) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  var h = headers || {};
  res.setHeader("Cache-Control", h["Cache-Control"] || "no-store");
  Object.keys(h).forEach(function (k) {
    if (k !== "Cache-Control") res.setHeader(k, h[k]);
  });
  res.end(JSON.stringify(obj));
}

function methodOnly(res, req, allowed) {
  if (allowed.indexOf(req.method) === -1) {
    json(res, 405, { error: "method not allowed", allowed: allowed }, { Allow: allowed.join(", ") });
    return false;
  }
  return true;
}

function header(req, name) {
  var h = (req && req.headers) || {};
  var v = h[name];
  return Array.isArray(v) ? v[0] : v;
}

/* ---------- request gates ---------- */

var PROD_HOSTS = ["makersonmuse.com", "www.makersonmuse.com", "makers-on-muse.vercel.app"];
var PREVIEW_HOST = /^makers-on-muse(?:-[a-z0-9-]+)?-cams-projects-c5c4c5f6\.vercel\.app$/;

/* Browsers send Origin on every POST. A request with no Origin is not a
   browser, so there is no visitor to protect; rate limits still apply.
   Production accepts the site's own hosts. Previews and local dev also
   accept this project's preview hosts and localhost. */
function originAllowed(req) {
  var o = header(req, "origin");
  if (o === undefined || o === "") return true;
  var u;
  try { u = new URL(o); } catch (e) { return false; }
  if (u.origin !== o) return false;
  var https = u.protocol === "https:" && u.port === "";
  if (https && PROD_HOSTS.indexOf(u.hostname) !== -1) return true;
  if (process.env.VERCEL_ENV === "production") return false;
  if (https && PREVIEW_HOST.test(u.hostname)) return true;
  if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return true;
  return false;
}

function isJson(req) {
  var ct = String(header(req, "content-type") || "");
  return ct.split(";")[0].trim().toLowerCase() === "application/json";
}

/* Checks that need no body: Origin (403), Content-Type (415) and a
   declared Content-Length over the cap (413). Returns null or
   { status, error }. Runs before anything reads the body, so a
   text/plain form post from another site is refused unread. */
function preflight(req) {
  if (!originAllowed(req)) return { status: 403, error: "forbidden origin" };
  if (!isJson(req)) return { status: 415, error: "Content-Type must be application/json" };
  var cl = header(req, "content-length");
  if (cl !== undefined && /^\d+$/.test(String(cl)) && Number(cl) > MAX_BODY_BYTES) {
    return { status: 413, error: "body too large (max " + MAX_BODY_BYTES + " bytes)" };
  }
  return null;
}

var TOO_LARGE = { status: 413, error: "body too large (max " + MAX_BODY_BYTES + " bytes)" };
var BAD_JSON = { status: 400, error: "invalid JSON body" };

function parseText(raw) {
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return TOO_LARGE;
  if (!raw) return BAD_JSON;
  try { return { status: 200, value: JSON.parse(raw) }; } catch (e) { return BAD_JSON; }
}

/* Read a JSON body of at most MAX_BODY_BYTES. Resolves to
   { status: 200, value } or { status: 400|413, error }. Vercel usually
   pre-parses req.body (its getter throws on bad JSON); otherwise the
   stream is read and cut off at the cap. */
function readJson(req) {
  var body;
  try { body = req.body; } catch (e) { return Promise.resolve(BAD_JSON); }
  if (body !== undefined && body !== null) {
    if (Buffer.isBuffer(body)) return Promise.resolve(parseText(body.toString("utf8")));
    if (typeof body === "string") return Promise.resolve(parseText(body));
    if (typeof body === "object") {
      var size;
      try { size = Buffer.byteLength(JSON.stringify(body), "utf8"); } catch (e) { return Promise.resolve(BAD_JSON); }
      if (size > MAX_BODY_BYTES) return Promise.resolve(TOO_LARGE);
      return Promise.resolve({ status: 200, value: body });
    }
    return Promise.resolve(BAD_JSON);
  }
  return new Promise(function (resolve) {
    var chunks = [];
    var size = 0;
    var done = false;
    function finish(r) { if (!done) { done = true; chunks = []; resolve(r); } }
    req.on("data", function (c) {
      if (done) return;
      size += c.length;
      if (size > MAX_BODY_BYTES) return finish(TOO_LARGE);
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c), "utf8"));
    });
    req.on("end", function () { if (!done) finish(parseText(Buffer.concat(chunks).toString("utf8"))); });
    req.on("error", function () { finish(BAD_JSON); });
  });
}

/* ---------- rate limiting ---------- */

var limiters = {};
var warned = {};

function warnOnce(key, msg) {
  if (warned[key]) return;
  warned[key] = true;
  console.warn(msg);
}

function clientIp(req) {
  var real = header(req, "x-real-ip");
  if (real) return String(real).trim();
  var fwd = header(req, "x-forwarded-for");
  if (fwd) return String(fwd).split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

/* Counters are keyed by a hash of the IP address, not the address. */
function ipKey(req) {
  return crypto.createHash("sha256").update("mom-rl|" + clientIp(req)).digest("hex").slice(0, 32);
}

/* rateLimit(req, name, tokens, window) -> { ok, retryAfter?, skipped? }
   Sliding window through @upstash/ratelimit when storage exists. With no
   storage it lets the request through and logs one warning per instance
   (the write will 503 anyway). A limiter error also lets it through. */
async function rateLimit(req, name, tokens, window) {
  var store = getStore();
  if (!store || !Ratelimit) {
    warnOnce("rl:" + name, "[makers-on-muse] rate limiting for " + name + " is off: no storage configured");
    return { ok: true, skipped: true };
  }
  if (!limiters[name]) {
    limiters[name] = new Ratelimit({
      redis: store,
      limiter: Ratelimit.slidingWindow(tokens, window),
      prefix: "mom:rl:" + name,
      analytics: false,
      timeout: 1500
    });
  }
  try {
    var r = await limiters[name].limit(ipKey(req));
    if (r.success) return { ok: true };
    return { ok: false, retryAfter: Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)) };
  } catch (e) {
    warnOnce("rl-err:" + name, "[makers-on-muse] rate limiter error for " + name + ": " + (e && e.message));
    return { ok: true, skipped: true };
  }
}

/* ---------- secrets ---------- */

/* Constant-time compare for the run secret. Unset secret never matches. */
function secretsEqual(a, b) {
  var A = Buffer.from(String(a === undefined || a === null ? "" : a), "utf8");
  var B = Buffer.from(String(b === undefined || b === null ? "" : b), "utf8");
  if (A.length !== B.length || A.length === 0) return false;
  return crypto.timingSafeEqual(A, B);
}

module.exports = {
  MAX_BODY_BYTES: MAX_BODY_BYTES,
  RUN_TTL_S: RUN_TTL_S,
  KEYS: KEYS,
  getStore: getStore,
  resetStore: resetStore,
  storeStatus: storeStatus,
  now: now,
  setClock: setClock,
  json: json,
  methodOnly: methodOnly,
  header: header,
  originAllowed: originAllowed,
  preflight: preflight,
  readJson: readJson,
  rateLimit: rateLimit,
  clientIp: clientIp,
  secretsEqual: secretsEqual
};
