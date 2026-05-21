import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAdminAuth,
  hashPassword,
  parseAdminCredentials,
  signSession,
  verifyPassword,
  verifySession,
} from '../src/adminAuth.js';

test('hashes and verifies passwords with scrypt', () => {
  const stored = hashPassword('correct horse');
  assert.match(stored, /^scrypt:[0-9a-f]+:[0-9a-f]+$/);
  assert.equal(verifyPassword('correct horse', stored), true);
  assert.equal(verifyPassword('wrong', stored), false);
  assert.equal(verifyPassword('correct horse', 'not-a-hash'), false);
});

test('signs and verifies session tokens, rejects tampering and expiry', () => {
  const token = signSession({ sub: 'ops1' }, 'secret-key', 60);
  assert.equal(verifySession(token, 'secret-key').sub, 'ops1');
  assert.equal(verifySession(token, 'other-key'), null);
  assert.equal(verifySession(`${token}x`, 'secret-key'), null);
  const expired = signSession({ sub: 'ops1' }, 'secret-key', -1);
  assert.equal(verifySession(expired, 'secret-key'), null);
});

test('parses credentials as array or map', () => {
  const fromArray = parseAdminCredentials(JSON.stringify([{ username: 'a', hash: 'scrypt:1:2' }]));
  const fromMap = parseAdminCredentials(JSON.stringify({ a: 'scrypt:1:2' }));
  assert.equal(fromArray[0].username, 'a');
  assert.equal(fromMap[0].hash, 'scrypt:1:2');
  assert.deepEqual(parseAdminCredentials(''), []);
});

test('middleware fails closed when nothing configured', () => {
  const auth = createAdminAuth({});
  assert.equal(auth.configured, false);
  let status;
  auth.middleware({ get: () => undefined, headers: {} }, { status: (code) => { status = code; return { json() {} }; } }, () => { status = 'next'; });
  assert.equal(status, 503);
});

test('middleware accepts valid session and rejects missing one', () => {
  const stored = hashPassword('pw');
  const auth = createAdminAuth({
    credentials: JSON.stringify([{ username: 'ops1', hash: stored }]),
    sessionSecret: 'sek',
    secureCookie: false,
  });
  const user = auth.login('ops1', 'pw');
  assert.equal(user.username, 'ops1');
  assert.equal(auth.login('ops1', 'bad'), null);

  const cookie = auth.issueCookie(user).split(';')[0]; // pf_admin_session=<token>
  let allowed = false;
  auth.middleware(
    { get: () => undefined, headers: { cookie } },
    { status: () => ({ json() {} }) },
    () => { allowed = true; }
  );
  assert.equal(allowed, true);

  let status;
  auth.middleware(
    { get: () => undefined, headers: {} },
    { status: (code) => { status = code; return { json() {} }; } },
    () => { status = 'next'; }
  );
  assert.equal(status, 401);
});

test('internal token bypass works for automation', () => {
  const auth = createAdminAuth({ internalToken: 'machine-token' });
  assert.equal(auth.configured, true);
  let allowed = false;
  auth.middleware(
    { get: (name) => (name === 'X-Pristine-Internal-Token' ? 'machine-token' : undefined), headers: {} },
    { status: () => ({ json() {} }) },
    () => { allowed = true; }
  );
  assert.equal(allowed, true);
});
