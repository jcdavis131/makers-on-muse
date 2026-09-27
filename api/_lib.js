/* Shared helpers for the Makers on Muse serverless API. Not a route
   (underscore prefix) — Vercel skips api/_*.js. CommonJS. */

"use strict";

var kv;
try {
  kv = require("@vercel/kv").kv;
} catch (e) {
  kv = null;
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

/* Honest KV check: ping, catch everything, never fake success. */
async function kvPing() {
  if (!kv) return false;
  try {
    await kv.ping();
    return true;
  } catch (e) {
    return false;
  }
}

/* Read a JSON body. Vercel usually pre-parses req.body; fall back to the stream. */
function readBody(req) {
  return new Promise(function (resolve, reject) {
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === "object") return resolve(req.body);
      try { return resolve(JSON.parse(String(req.body))); }
      catch (e) { return reject(new Error("invalid JSON body")); }
    }
    var chunks = [];
    req.on("data", function (c) { chunks.push(c); });
    req.on("end", function () {
      var raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error("invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

/* Timing-attack-resistant-ish string compare for the run secret. */
function secretsEqual(a, b) {
  var A = String(a === undefined || a === null ? "" : a);
  var B = String(b === undefined || b === null ? "" : b);
  if (A.length !== B.length || A.length === 0) return false;
  var d = 0;
  for (var i = 0; i < A.length; i++) d |= A.charCodeAt(i) ^ B.charCodeAt(i);
  return d === 0;
}

function methodOnly(res, req, allowed) {
  if (allowed.indexOf(req.method) === -1) {
    json(res, 405, { error: "method not allowed", allowed: allowed });
    return false;
  }
  return true;
}

module.exports = {
  kv: kv,
  json: json,
  kvPing: kvPing,
  readBody: readBody,
  secretsEqual: secretsEqual,
  methodOnly: methodOnly
};
