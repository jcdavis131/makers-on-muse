/* Makers on Muse — receipt codes and secret tokens. Node crypto only.

   Each submission gets two strings:
   - a receipt code, like "1-a3f5c9e2". It is 32 bits, short enough to
     read aloud. It is for display only and proves nothing.
   - a secret token, like "mom_" + 22 base64url characters (128 bits).
     It is the credential for later status, edit and delete requests. It is
     returned once, in the submit response, and only its SHA-256 hash is
     stored. A 128-bit random value needs no salt or slow hash. */

"use strict";

var crypto = require("crypto");

var TOKEN_RE = /^mom_[A-Za-z0-9_-]{22}$/;

function newReceiptCode(week) {
  return week + "-" + crypto.randomBytes(4).toString("hex");
}

function newToken() {
  return "mom_" + crypto.randomBytes(16).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

/* Constant-time check of a presented token against a stored hash. */
function tokenMatches(token, storedHash) {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return false;
  if (typeof storedHash !== "string" || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
  var a = Buffer.from(hashToken(token), "hex");
  var b = Buffer.from(storedHash, "hex");
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  TOKEN_RE: TOKEN_RE,
  newReceiptCode: newReceiptCode,
  newToken: newToken,
  hashToken: hashToken,
  tokenMatches: tokenMatches
};
