/* In-memory Redis for tests, served over the Upstash REST protocol, so
   the real @upstash/redis client and @upstash/ratelimit run against it
   unchanged (serialization, options, the evalsha -> eval fallback).

   - Strings, lists and sorted sets, with TTLs on every key.
   - A clock the test controls: advance(ms) moves time forward, and keys
     past their expiry are gone.
   - Only the commands the API uses. Anything else is an error, so a new
     command in the API fails a test instead of passing by accident.
   - EVALSHA always answers NOSCRIPT. EVAL runs only @upstash/ratelimit's
     single-region sliding-window script, emulated here in JS.

   Usage:
     const emu = createEmulator();
     const srv = await serveUpstash(emu);   // { url, token, close() }
     process.env.UPSTASH_REDIS_REST_URL = srv.url; ...  */
import http from "node:http";

export function createEmulator() {
  const data = new Map(); // key -> { type, value, exp (ms epoch) | null }
  let offset = 0;
  const now = () => Date.now() + offset;
  const log = [];

  function alive(key) {
    const e = data.get(key);
    if (!e) return null;
    if (e.exp !== null && e.exp <= now()) { data.delete(key); return null; }
    return e;
  }
  function typed(key, type) {
    const e = alive(key);
    if (e && e.type !== type) throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    return e;
  }
  const int = (s) => {
    if (!/^-?\d+$/.test(String(s))) throw new Error("ERR value is not an integer or out of range");
    return Number(s);
  };
  const up = (a) => String(a).toUpperCase();

  function setExpiry(key, expMs, opt) {
    const e = alive(key);
    if (!e) return 0;
    if (opt === "NX" && e.exp !== null) return 0;
    if (opt === "XX" && e.exp === null) return 0;
    e.exp = expMs;
    if (e.exp <= now()) data.delete(key);
    return 1;
  }

  function rangeIdx(len, a, b) {
    let s = int(a), t = int(b);
    if (s < 0) s = Math.max(0, len + s);
    if (t < 0) t = len + t;
    t = Math.min(t, len - 1);
    return [s, t];
  }

  function zsorted(e) {
    return [...e.value.entries()].sort((x, y) => (x[1] - y[1]) || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  }

  function incrby(key, by) {
    const e = typed(key, "string");
    const n = (e ? int(e.value) : 0) + by;
    if (e) e.value = String(n);
    else data.set(key, { type: "string", value: String(n), exp: null });
    return n;
  }

  /* @upstash/ratelimit 2.0.8, single region, slidingWindow limit script. */
  function slidingWindowLimit(keys, args) {
    const [currentKey, previousKey, dynamicLimitKey] = keys;
    let limit = Number(args[0]);
    const nowMs = Number(args[1]);
    const windowMs = Number(args[2]);
    const incrementBy = Number(args[3]);
    if (dynamicLimitKey) {
      const d = typed(dynamicLimitKey, "string");
      if (d) limit = Number(d.value);
    }
    const cur = typed(currentKey, "string");
    const prev = typed(previousKey, "string");
    const inCurrent = cur ? Number(cur.value) : 0;
    let inPrevious = prev ? Number(prev.value) : 0;
    const pct = (nowMs % windowMs) / windowMs;
    inPrevious = Math.floor((1 - pct) * inPrevious);
    if (incrementBy > 0 && inPrevious + inCurrent >= limit) return [-1, limit];
    const v = incrby(currentKey, incrementBy);
    if (v === incrementBy) setExpiry(currentKey, now() + windowMs * 2 + 1000);
    return [limit - (v + inPrevious), limit];
  }

  const commands = {
    PING: () => "PONG",
    GET: (k) => { const e = typed(k, "string"); return e ? e.value : null; },
    MGET: (...ks) => ks.map((k) => { const e = alive(k); return e && e.type === "string" ? e.value : null; }),
    SET: (k, v, ...opts) => {
      let nx = false, xx = false, get = false, exp = null, keep = false;
      for (let i = 0; i < opts.length; i++) {
        const o = up(opts[i]);
        if (o === "NX") nx = true;
        else if (o === "XX") xx = true;
        else if (o === "GET") get = true;
        else if (o === "KEEPTTL") keep = true;
        else if (o === "EX") exp = now() + int(opts[++i]) * 1000;
        else if (o === "PX") exp = now() + int(opts[++i]);
        else if (o === "EXAT") exp = int(opts[++i]) * 1000;
        else if (o === "PXAT") exp = int(opts[++i]);
        else throw new Error("ERR syntax error");
      }
      const e = alive(k);
      if (e && e.type !== "string" && get) throw new Error("WRONGTYPE");
      const old = e && e.type === "string" ? e.value : null;
      if ((nx && e) || (xx && !e)) return get ? old : null;
      data.set(k, { type: "string", value: String(v), exp: keep && e ? e.exp : exp });
      return get ? old : "OK";
    },
    DEL: (...ks) => ks.reduce((n, k) => n + (alive(k) && data.delete(k) ? 1 : 0), 0),
    EXISTS: (...ks) => ks.reduce((n, k) => n + (alive(k) ? 1 : 0), 0),
    INCR: (k) => incrby(k, 1),
    INCRBY: (k, n) => incrby(k, int(n)),
    EXPIRE: (k, s, opt) => setExpiry(k, now() + int(s) * 1000, opt && up(opt)),
    PEXPIRE: (k, ms, opt) => setExpiry(k, now() + int(ms), opt && up(opt)),
    EXPIREAT: (k, t, opt) => setExpiry(k, int(t) * 1000, opt && up(opt)),
    TTL: (k) => { const e = alive(k); return !e ? -2 : e.exp === null ? -1 : Math.ceil((e.exp - now()) / 1000); },
    PTTL: (k) => { const e = alive(k); return !e ? -2 : e.exp === null ? -1 : e.exp - now(); },
    RPUSH: (k, ...vs) => {
      const e = typed(k, "list");
      if (e) { e.value.push(...vs.map(String)); return e.value.length; }
      data.set(k, { type: "list", value: vs.map(String), exp: null });
      return vs.length;
    },
    LRANGE: (k, a, b) => {
      const e = typed(k, "list");
      if (!e) return [];
      const [s, t] = rangeIdx(e.value.length, a, b);
      return s > t ? [] : e.value.slice(s, t + 1);
    },
    LTRIM: (k, a, b) => {
      const e = typed(k, "list");
      if (!e) return "OK";
      const [s, t] = rangeIdx(e.value.length, a, b);
      e.value = s > t ? [] : e.value.slice(s, t + 1);
      if (!e.value.length) data.delete(k);
      return "OK";
    },
    LLEN: (k) => { const e = typed(k, "list"); return e ? e.value.length : 0; },
    ZADD: (k, ...rest) => {
      const flags = new Set();
      while (rest.length && /^(NX|XX|GT|LT|CH|INCR)$/i.test(String(rest[0]))) flags.add(up(rest.shift()));
      if (flags.size) throw new Error("ERR emulator: ZADD flags not supported");
      if (!rest.length || rest.length % 2) throw new Error("ERR syntax error");
      let e = typed(k, "zset");
      if (!e) { e = { type: "zset", value: new Map(), exp: null }; data.set(k, e); }
      let added = 0;
      for (let i = 0; i < rest.length; i += 2) {
        const score = Number(rest[i]);
        if (!isFinite(score)) throw new Error("ERR value is not a valid float");
        if (!e.value.has(String(rest[i + 1]))) added++;
        e.value.set(String(rest[i + 1]), score);
      }
      return added;
    },
    ZREM: (k, ...ms) => {
      const e = typed(k, "zset");
      if (!e) return 0;
      const n = ms.reduce((c, m) => c + (e.value.delete(String(m)) ? 1 : 0), 0);
      if (!e.value.size) data.delete(k);
      return n;
    },
    ZCARD: (k) => { const e = typed(k, "zset"); return e ? e.value.size : 0; },
    ZSCORE: (k, m) => { const e = typed(k, "zset"); return e && e.value.has(String(m)) ? String(e.value.get(String(m))) : null; },
    ZRANGE: (k, a, b, ...opts) => {
      let rev = false, withScores = false;
      for (const o of opts.map(up)) {
        if (o === "REV") rev = true;
        else if (o === "WITHSCORES") withScores = true;
        else throw new Error("ERR emulator: ZRANGE option " + o + " not supported");
      }
      const e = typed(k, "zset");
      if (!e) return [];
      let list = zsorted(e);
      if (rev) list = list.reverse();
      const [s, t] = rangeIdx(list.length, a, b);
      const slice = s > t ? [] : list.slice(s, t + 1);
      return withScores ? slice.flatMap(([m, sc]) => [m, String(sc)]) : slice.map(([m]) => m);
    },
    EVALSHA: () => { throw new Error("NOSCRIPT No matching script. Please use EVAL."); },
    EVAL: (script, numkeys, ...rest) => {
      const n = int(numkeys);
      const keys = rest.slice(0, n), args = rest.slice(n);
      const s = String(script);
      if (s.includes("requestsInPreviousWindow") && s.includes("INCRBY") && s.includes("PEXPIRE")) {
        return slidingWindowLimit(keys, args);
      }
      throw new Error("ERR emulator: unsupported script");
    }
  };

  const failing = new Set();

  function exec(cmd) {
    if (!Array.isArray(cmd) || !cmd.length) throw new Error("ERR empty command");
    const name = up(cmd[0]);
    const fn = commands[name];
    if (!fn) throw new Error("ERR unknown command '" + cmd[0] + "'");
    log.push(name);
    if (failing.has(name)) { failing.delete(name); throw new Error("ERR emulator: injected failure on " + name); }
    return fn(...cmd.slice(1).map((a) => (a === null ? "" : a)));
  }

  return {
    exec,
    log,
    now,
    advance(ms) { offset += ms; },
    /* The next call of this command fails with an error reply. */
    failNext(name) { failing.add(String(name).toUpperCase()); },
    /* Every live key with its type and expiry (ms epoch, or null). */
    keys() {
      return [...data.keys()].map((k) => alive(k) ? { key: k, type: data.get(k).type, exp: data.get(k).exp } : null)
        .filter(Boolean);
    },
    raw(key) { const e = alive(key); return e ? e.value : null; },
    flush() { data.clear(); log.length = 0; }
  };
}

/* Upstash-Encoding: base64 (the client's default) sends every string in
   a result base64-encoded, except a bare "OK". */
function encode64(v) {
  if (typeof v === "string") return v === "OK" ? v : Buffer.from(v, "utf8").toString("base64");
  if (Array.isArray(v)) return v.map(encode64);
  return v;
}

/* Serve the emulator the way Upstash does: POST a JSON command array to
   the base URL with "Authorization: Bearer <token>", get {result} or
   {error} back. Pipelines aren't used by the API, so they're refused. */
export function serveUpstash(emu, token = "test-token") {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const send = (status, obj) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (req.method !== "POST") return send(405, { error: "ERR method" });
      if (req.headers.authorization !== "Bearer " + token) return send(401, { error: "Unauthorized" });
      if (req.url !== "/" && req.url !== "") return send(400, { error: "ERR emulator: path " + req.url + " not supported" });
      let cmd;
      try { cmd = JSON.parse(body); } catch { return send(400, { error: "ERR bad json" }); }
      const b64 = String(req.headers["upstash-encoding"] || "").toLowerCase() === "base64";
      try {
        const result = emu.exec(cmd);
        send(200, { result: b64 ? encode64(result) : result });
      } catch (e) { send(400, { error: e.message }); }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        url: "http://127.0.0.1:" + server.address().port,
        token,
        close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); })
      });
    });
  });
}
