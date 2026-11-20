/**
 * temporaryPassword.js  (backend / CommonJS, PURE — no firebase, no I/O)
 * --------------------------------------------------------------------
 * Generates the one-time temporary passwords issued to admin-created student
 * accounts (bulk import + "create account later" + "new temporary password").
 *
 * Security properties:
 *   • Cryptographically secure: every character comes from crypto.randomInt
 *     (uniform, no modulo bias) — never Math.random.
 *   • Unpredictable: nothing is derived from the student's name, birthday or
 *     email; each password is independent.
 *   • 12 characters over a 61-symbol alphabet with one guaranteed upper, lower,
 *     digit and symbol (≈ 70 bits of entropy).
 *   • Readable when dictated or copied: visually ambiguous characters
 *     (0/O/o, 1/l/I) are excluded.
 *   • Spreadsheet-safe: no character that makes Excel treat a cell as a formula
 *     (= + - @), so the credential export can never become a formula payload.
 *
 * The plaintext is NEVER stored or logged: callers hand it to Firebase Auth
 * (which hashes it) and return it exactly once in the admin's HTTPS response.
 */

const crypto = require('crypto');

const UPPER   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER   = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS  = '23456789';
const SYMBOLS = '#%*!?';
const ALPHABET = UPPER + LOWER + DIGITS + SYMBOLS;

const DEFAULT_LENGTH = 12;
const MIN_LENGTH = 10;

/**
 * @param {object} [opts]
 * @param {number} [opts.length=12]
 * @param {(max:number)=>number} [opts.randomInt]  injectable for tests; defaults
 *        to crypto.randomInt (exclusive upper bound).
 * @returns {string}
 */
function generateTemporaryPassword({ length = DEFAULT_LENGTH, randomInt = crypto.randomInt } = {}) {
  if (!Number.isInteger(length) || length < MIN_LENGTH) {
    throw new Error(`Temporary passwords must be at least ${MIN_LENGTH} characters.`);
  }
  const pick = (set) => set[randomInt(set.length)];
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(ALPHABET));
  // Fisher–Yates shuffle (crypto randomness) so the guaranteed classes are not
  // always in the first four positions.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * A generator that additionally guarantees uniqueness within one batch (one
 * import), so no two students in the same credential export can ever share a
 * password — collisions are astronomically unlikely, but this makes it a
 * guarantee rather than a probability.
 * @returns {() => string}
 */
function createPasswordGenerator(opts = {}) {
  const issued = new Set();
  return () => {
    let p;
    do { p = generateTemporaryPassword(opts); } while (issued.has(p));
    issued.add(p);
    return p;
  };
}

module.exports = {
  ALPHABET,
  DEFAULT_LENGTH,
  MIN_LENGTH,
  generateTemporaryPassword,
  createPasswordGenerator,
};
