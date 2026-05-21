import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_KEYLEN = 64;
const DEFAULT_TTL_SECONDS = 8 * 60 * 60; // 8 hours
const DEFAULT_COOKIE_NAME = 'pf_admin_session';

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBuffer(input) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

// ---- Password hashing (scrypt, built-in crypto, no native deps) ----

export function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(String(password), salt, SCRYPT_KEYLEN);
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (salt.length === 0 || expected.length === 0) return false;
  let actual;
  try {
    actual = scryptSync(String(password), salt, expected.length);
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// ---- Session token (HMAC-SHA256 signed, JWT-shaped) ----

export function signSession(payload, secret, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const data = `${header}.${body}`;
  const sig = base64url(createHmac('sha256', secret).update(data).digest());
  return `${data}.${sig}`;
}

export function verifySession(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const expectedSig = createHmac('sha256', secret).update(data).digest();
  const providedSig = base64urlToBuffer(parts[2]);
  if (providedSig.length !== expectedSig.length || !timingSafeEqual(providedSig, expectedSig)) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(base64urlToBuffer(parts[1]).toString('utf8'));
  } catch {
    return null;
  }
  if (!payload.exp || Math.floor(Date.now() / 1000) >= payload.exp) {
    return null;
  }
  return payload;
}

export function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

export function parseAdminCredentials(raw) {
  if (!raw) return [];
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new Error('ADMIN_CREDENTIALS must be valid JSON');
  }
  // Accept either [{username, hash}] or { username: hash }
  const list = Array.isArray(parsed)
    ? parsed.map((entry) => ({ username: String(entry.username || '').trim(), hash: String(entry.hash || entry.passwordHash || '') }))
    : Object.entries(parsed).map(([username, hash]) => ({ username: String(username).trim(), hash: String(hash) }));
  return list.filter((entry) => entry.username && entry.hash);
}

export function createAdminAuth({
  credentials,
  sessionSecret,
  internalToken,
  cookieName = DEFAULT_COOKIE_NAME,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  secureCookie = true,
} = {}) {
  const users = parseAdminCredentials(credentials);
  const hasSessionAuth = users.length > 0 && Boolean(sessionSecret);
  const configured = hasSessionAuth || Boolean(internalToken);

  function login(username, password) {
    if (!hasSessionAuth) return null;
    const user = users.find((entry) => entry.username === String(username || '').trim());
    if (!user || !verifyPassword(password, user.hash)) return null;
    return { username: user.username };
  }

  function issueCookie(user) {
    const token = signSession({ sub: user.username }, sessionSecret, ttlSeconds);
    const attrs = [
      `${cookieName}=${token}`,
      'HttpOnly',
      'SameSite=Lax',
      'Path=/',
      `Max-Age=${ttlSeconds}`,
    ];
    if (secureCookie) attrs.push('Secure');
    return attrs.join('; ');
  }

  function clearCookie() {
    const attrs = [`${cookieName}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
    if (secureCookie) attrs.push('Secure');
    return attrs.join('; ');
  }

  function identify(req) {
    // Machine bypass for automation/CI when an internal token is configured.
    if (internalToken && req.get('X-Pristine-Internal-Token') === internalToken) {
      return { username: 'service-token', via: 'token' };
    }
    if (!hasSessionAuth) return null;
    const cookies = parseCookies(req.headers.cookie);
    const payload = verifySession(cookies[cookieName], sessionSecret);
    return payload ? { username: payload.sub, via: 'session' } : null;
  }

  function middleware(req, res, next) {
    // Fail closed: if no auth is configured, lock the endpoint instead of allowing it.
    if (!configured) {
      res.status(503).json({ error: 'Admin authentication is not configured on this server.' });
      return;
    }
    const user = identify(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    req.adminUser = user;
    next();
  }

  return { login, issueCookie, clearCookie, identify, middleware, configured, hasSessionAuth, cookieName };
}
