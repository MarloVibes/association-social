'use strict';

const {
  createHmac,
  timingSafeEqual,
} = require('node:crypto');
const { Buffer } = require('node:buffer');

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalize(value[key]);
      return result;
    }, {});
  }
  return value;
}

function encodedPayload(payload) {
  return JSON.stringify(canonicalize(payload));
}

function signatureFor(payload, secret) {
  return createHmac('sha256', secret).update(encodedPayload(payload)).digest('hex');
}

function signAuthorizationReceipt(payload, secret) {
  if (!secret) throw new Error('Trade authorization secret is unavailable.');
  const unsigned = { ...payload };
  delete unsigned.signature;
  return { ...unsigned, signature: signatureFor(unsigned, secret) };
}

function verifyAuthorizationReceipt(receipt, expectedPayload, secret) {
  if (!secret || !receipt || typeof receipt !== 'object' || !expectedPayload) return false;
  const { signature, ...unsigned } = receipt;
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  if (encodedPayload(unsigned) !== encodedPayload(expectedPayload)) return false;

  const supplied = Buffer.from(signature, 'hex');
  const expected = Buffer.from(signatureFor(expectedPayload, secret), 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

module.exports = {
  signAuthorizationReceipt,
  verifyAuthorizationReceipt,
};
