/* Shared test harness for the handler tests: mock requests and
   responses shaped like Vercel's Node runtime, and a pass/fail counter. */
import { EventEmitter } from "node:events";

export function counter() {
  let pass = 0, fail = 0;
  return {
    t(name, cond, extra) {
      if (cond) pass++;
      else { fail++; console.error("FAIL:", name, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); }
    },
    done() {
      console.log(`\n${pass} passed, ${fail} failed`);
      process.exit(fail ? 1 : 0);
    }
  };
}

export const JSON_HEADERS = { "content-type": "application/json" };

/* A request whose body Vercel has already parsed (req.body set). */
export function mockReq(method, { query = {}, body, headers = JSON_HEADERS } = {}) {
  return { method, query, body, headers: { ...headers }, on() {} };
}

/* A request whose body arrives on the stream (req.body undefined). */
export function streamReq(method, raw, headers = JSON_HEADERS) {
  const req = new EventEmitter();
  req.method = method;
  req.query = {};
  req.headers = { ...headers };
  setImmediate(() => {
    const buf = Buffer.from(raw, "utf8");
    for (let i = 0; i < buf.length; i += 16384) req.emit("data", buf.subarray(i, i + 16384));
    req.emit("end");
  });
  return req;
}

export function call(handler, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {}, chunks: [],
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      writeHead(c, h) {
        this.statusCode = c;
        for (const [k, v] of Object.entries(h || {})) this.headers[k.toLowerCase()] = v;
      },
      write(c) { this.chunks.push(String(c)); },
      end(c) {
        if (c !== undefined) this.chunks.push(String(c));
        let body = null;
        try { body = JSON.parse(this.chunks.join("")); } catch (e) {}
        resolve({ status: this.statusCode, headers: this.headers, body, raw: this.chunks.join("") });
      },
      on() {}
    };
    Promise.resolve(handler(req, res)).catch((e) => {
      resolve({ status: 500, threw: String((e && e.message) || e) });
    });
  });
}

/* A valid Week 1 submission with fictional values. */
export function goodSubmission(overrides = {}) {
  return {
    week: 1, handle: "juniper-player", agent: "Juniper",
    levels: [1, 2, 3, 4].map((n) => ({
      n, answer: "a fictional answer", tokens_est: 100, seconds: 10,
      procedure: "did things in order", correct: 1, procedure_score: 0.5
    })),
    consent: { redaction: true, publish: false },
    ...overrides
  };
}

/* Inside Week 1: Tue Oct 6 2026, 12:00 UTC. */
export const IN_WEEK_1 = Date.parse("2026-10-06T12:00:00Z");
