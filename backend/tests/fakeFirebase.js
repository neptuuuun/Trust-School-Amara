/**
 * fakeFirebase.js — an in-memory stand-in for backend/config/firebase.js
 * ----------------------------------------------------------------------
 * Lets integration tests run the REAL middleware, controllers and services
 * (auth guard, bulk importer, annual-fee service, ledger, audit…) without a
 * Firebase project. It implements only the Admin SDK surface the backend uses:
 *
 *   Firestore: collection/doc/add/get/set(merge)/update(dotted paths)/delete,
 *              where('==' | 'in' | 'array-contains'), orderBy/limit (no-ops on
 *              order, limit honoured), FieldValue.serverTimestamp/arrayUnion/
 *              increment/delete, Timestamp.fromDate/fromMillis/now.
 *   Auth:      createUser/getUser/getUserByEmail/getUsers/updateUser/deleteUser/
 *              revokeRefreshTokens/verifyIdToken, with failure injection and
 *              optional latency.
 *
 * Install with installFakeFirebase() BEFORE requiring any backend module.
 */

const path = require('path');

class FakeTimestamp {
  constructor(ms) { this._ms = ms; this.seconds = Math.floor(ms / 1000); this.nanoseconds = 0; }
  toDate() { return new Date(this._ms); }
  toMillis() { return this._ms; }
}

const FieldValue = {
  serverTimestamp: () => ({ __fv: 'serverTimestamp' }),
  arrayUnion: (...items) => ({ __fv: 'arrayUnion', items }),
  increment: (n) => ({ __fv: 'increment', n }),
  delete: () => ({ __fv: 'delete' }),
};
const Timestamp = {
  fromDate: (d) => new FakeTimestamp(d.getTime()),
  fromMillis: (ms) => new FakeTimestamp(ms),
  now: () => new FakeTimestamp(Date.now()),
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && !(v instanceof FakeTimestamp) && !(v instanceof Date) && !v.__fv;

function clone(v) {
  if (v instanceof FakeTimestamp) return new FakeTimestamp(v._ms);
  if (v instanceof Date) return new Date(v.getTime());
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = clone(x);
    return out;
  }
  return v;
}

function resolveValue(v, prev) {
  if (v && v.__fv === 'serverTimestamp') return new FakeTimestamp(Date.now());
  if (v && v.__fv === 'arrayUnion') {
    const base = Array.isArray(prev) ? prev.slice() : [];
    v.items.forEach((it) => {
      if (!base.some((b) => JSON.stringify(b) === JSON.stringify(it))) base.push(clone(it));
    });
    return base;
  }
  if (v && v.__fv === 'increment') return (Number(prev) || 0) + v.n;
  if (v === undefined) throw new Error('Fake Firestore: undefined value (real Firestore rejects this)');
  if (isPlainObject(v)) {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (x && x.__fv === 'delete') continue;
      out[k] = resolveValue(x, undefined);
    }
    return out;
  }
  return clone(v);
}

function mergeInto(target, data) {
  for (const [k, v] of Object.entries(data)) {
    if (v && v.__fv === 'delete') { delete target[k]; continue; }
    if (isPlainObject(v) && isPlainObject(target[k])) mergeInto(target[k], v);
    else target[k] = resolveValue(v, target[k]);
  }
  return target;
}

function setPath(target, dotted, v) {
  const parts = dotted.split('.');
  let cur = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!isPlainObject(cur[parts[i]])) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (v && v.__fv === 'delete') delete cur[last];
  else cur[last] = resolveValue(v, cur[last]);
}

const getPath = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

const AUTO_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const autoId = () => Array.from({ length: 20 }, () => AUTO_ID_CHARS[Math.floor(Math.random() * AUTO_ID_CHARS.length)]).join('');

function codeError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function createFakeFirestore() {
  const store = new Map(); // full doc path → data
  const writeFailures = []; // RegExp list: any write to a matching path throws

  const checkWrite = (p) => {
    if (writeFailures.some((re) => re.test(p))) throw codeError('unavailable', `Injected write failure for ${p}`);
  };

  class DocSnap {
    constructor(ref, data) { this.ref = ref; this.id = ref.id; this._data = data; this.exists = data !== undefined; }
    data() { return this._data === undefined ? undefined : clone(this._data); }
    get(field) { return this._data ? clone(getPath(this._data, field)) : undefined; }
  }

  class DocRef {
    constructor(p) { this.path = p; this.id = p.split('/').pop(); }
    collection(name) { return new CollRef(`${this.path}/${name}`); }
    async get() { return new DocSnap(this, store.has(this.path) ? store.get(this.path) : undefined); }
    async set(data, opts = {}) {
      checkWrite(this.path);
      if (opts.merge && store.has(this.path)) store.set(this.path, mergeInto(clone(store.get(this.path)), data));
      else store.set(this.path, resolveValue(data, undefined));
    }
    async update(data) {
      checkWrite(this.path);
      if (!store.has(this.path)) throw codeError(5, `NOT_FOUND: ${this.path}`);
      const next = clone(store.get(this.path));
      for (const [k, v] of Object.entries(data)) setPath(next, k, v);
      store.set(this.path, next);
    }
    async delete() { checkWrite(this.path); store.delete(this.path); }
  }

  class Query {
    constructor(collPath, filters = [], max = null) { this.collPath = collPath; this.filters = filters; this.max = max; }
    where(field, op, value) { return new Query(this.collPath, [...this.filters, { field, op, value }], this.max); }
    orderBy() { return this; }
    limit(n) { return new Query(this.collPath, this.filters, n); }
    async get() {
      const prefix = `${this.collPath}/`;
      let docs = [];
      for (const [p, data] of store.entries()) {
        if (!p.startsWith(prefix) || p.slice(prefix.length).includes('/')) continue;
        const ok = this.filters.every(({ field, op, value }) => {
          const v = getPath(data, field);
          if (op === '==') return v === value;
          if (op === 'in') return Array.isArray(value) && value.includes(v);
          if (op === 'array-contains') return Array.isArray(v) && v.includes(value);
          throw new Error(`Fake Firestore: unsupported operator ${op}`);
        });
        if (ok) docs.push(new DocSnap(new DocRef(p), data));
      }
      if (this.max != null) docs = docs.slice(0, this.max);
      return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn) => docs.forEach(fn) };
    }
  }

  class CollRef extends Query {
    constructor(p) { super(p); this.path = p; this.id = p.split('/').pop(); }
    doc(id) { return new DocRef(`${this.path}/${id || autoId()}`); }
    async add(data) { const ref = this.doc(); await ref.set(data); return ref; }
  }

  return {
    collection: (name) => new CollRef(name),
    doc: (p) => new DocRef(p),
    _store: store,
    _failWritesMatching: (re) => writeFailures.push(re),
    _clearWriteFailures: () => { writeFailures.length = 0; },
    _docsUnder: (collPath) => [...store.entries()]
      .filter(([p]) => p.startsWith(`${collPath}/`) && !p.slice(collPath.length + 1).includes('/'))
      .map(([p, d]) => ({ id: p.split('/').pop(), ...clone(d) })),
    _seed: (p, data) => store.set(p, resolveValue(data, undefined)),
  };
}

function createFakeAuth() {
  const users = new Map(); // uid → record (password kept ONLY to assert logins in tests)
  const tokens = new Map();
  const failures = new Map(); // email → code (persistent until cleared)
  const revoked = [];
  let latencyMs = 0;

  const wait = () => (latencyMs ? new Promise((r) => setTimeout(r, latencyMs)) : Promise.resolve());
  const byEmail = (email) => [...users.values()].find((u) => u.email && u.email === String(email).toLowerCase());
  const publicRecord = (u) => ({ uid: u.uid, email: u.email, displayName: u.displayName, emailVerified: u.emailVerified, disabled: false });

  return {
    async createUser(props) {
      await wait();
      const email = props.email ? String(props.email).toLowerCase() : null;
      if (email && failures.has(email)) throw codeError(failures.get(email));
      if (props.uid && users.has(props.uid)) throw codeError('auth/uid-already-exists');
      if (email && byEmail(email)) throw codeError('auth/email-already-exists');
      if (props.password != null && String(props.password).length < 6) throw codeError('auth/invalid-password');
      const uid = props.uid || autoId();
      users.set(uid, { uid, email, password: props.password, displayName: props.displayName || '', emailVerified: Boolean(props.emailVerified) });
      return publicRecord(users.get(uid));
    },
    async getUser(uid) {
      const u = users.get(uid);
      if (!u) throw codeError('auth/user-not-found');
      return publicRecord(u);
    },
    async getUserByEmail(email) {
      const u = byEmail(email);
      if (!u) throw codeError('auth/user-not-found');
      return publicRecord(u);
    },
    async getUsers(identifiers) {
      if (identifiers.length > 100) throw codeError('auth/maximum-user-count-exceeded');
      const found = [];
      const notFound = [];
      identifiers.forEach((id) => {
        const u = id.uid ? users.get(id.uid) : byEmail(id.email);
        if (u) found.push(publicRecord(u)); else notFound.push(id);
      });
      return { users: found, notFound };
    },
    async updateUser(uid, props) {
      await wait();
      const u = users.get(uid);
      if (!u) throw codeError('auth/user-not-found');
      Object.assign(u, props);
      return publicRecord(u);
    },
    async deleteUser(uid) {
      if (!users.has(uid)) throw codeError('auth/user-not-found');
      users.delete(uid);
    },
    async revokeRefreshTokens(uid) { revoked.push(uid); },
    async verifyIdToken(token) {
      if (!tokens.has(token)) throw codeError('auth/argument-error');
      return { ...tokens.get(token) };
    },
    _users: users,
    _revoked: revoked,
    _addToken: (token, decoded) => tokens.set(token, decoded),
    _failCreateFor: (email, code) => failures.set(String(email).toLowerCase(), code),
    _clearFailures: () => failures.clear(),
    _setLatency: (ms) => { latencyMs = ms; },
    _passwordOf: (uid) => users.get(uid)?.password,
  };
}

/** Replace backend/config/firebase.js in the module cache. Returns the fakes. */
function installFakeFirebase() {
  const db = createFakeFirestore();
  const auth = createFakeAuth();
  const admin = { apps: [{}], firestore: { FieldValue, Timestamp } };
  const target = require.resolve(path.join(__dirname, '..', 'config', 'firebase.js'));
  require.cache[target] = { id: target, filename: target, loaded: true, exports: { admin, db, auth } };
  return { admin, db, auth };
}

module.exports = { installFakeFirebase, FakeTimestamp };
