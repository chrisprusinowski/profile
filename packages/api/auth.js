import crypto from 'node:crypto';
import { ALL_ROLES } from '../shared/roles.js';

const HASH_ALGO = 'sha256';
const HASH_COST = 64;
const TOKEN_TTL_SECONDS = 60 * 60 * 12;

function b64urlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString();
}

export async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derivedKey = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, HASH_COST, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });

  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password, hash) {
  const [scheme, salt, digest] = hash.split('$');
  if (scheme !== 'scrypt' || !salt || !digest) {
    return false;
  }

  const expected = Buffer.from(digest, 'hex');
  const computed = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, expected.length, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });

  return crypto.timingSafeEqual(expected, computed);
}

export function issueAuthToken({ userId, roles }, secret) {
  if (!secret) throw new Error('Missing token secret');
  if (!Array.isArray(roles) || roles.some((role) => !ALL_ROLES.includes(role))) {
    throw new Error('Token roles must use shared role enum values');
  }

  const header = b64urlEncode(JSON.stringify({ alg: HASH_ALGO, typ: 'JWT' }));
  const payload = b64urlEncode(
    JSON.stringify({
      sub: userId,
      roles,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    }),
  );
  const signature = crypto
    .createHmac(HASH_ALGO, secret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

export function validateAuthToken(token, secret) {
  if (!token || !secret) return null;

  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) return null;

  const expectedSignature = crypto
    .createHmac(HASH_ALGO, secret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length) return null;

  const signatureMatches = crypto.timingSafeEqual(provided, expected);
  if (!signatureMatches) return null;

  const claims = JSON.parse(b64urlDecode(payload));
  if (!Array.isArray(claims.roles) || claims.roles.some((role) => !ALL_ROLES.includes(role))) {
    return null;
  }

  if (claims.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return claims;
}

export function requireRoles(allowedRoles = []) {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    throw new Error('allowedRoles must include at least one role');
  }

  return (req, res, next) => {
    const userRoles = req.auth?.roles ?? [];
    const isAuthorized = userRoles.some((role) => allowedRoles.includes(role));

    if (!isAuthorized) {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }

    next();
  };
}
