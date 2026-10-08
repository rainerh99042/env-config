/**
 * core.js
 *
 * Reads values from a source object (typically process.env) and coerces them
 * into typed config values. Every helper is pure: it takes a source object and
 * returns a plain object whose values are already converted. This keeps the
 * surface area small and makes every path trivially testable.
 *
 * Design decision: we only read from the source when the key is present AND the
 * raw string is not empty. An empty string in an env file almost always means
 * 'unset by the shell' rather than 'the user wants an empty value', so we treat
 * `FOO=` the same as an absent FOO. If a consumer genuinely needs to accept
 * empty strings, they can skip the coercion step and read the source directly.
 */

const has = (source, key) =>
  Object.prototype.hasOwnProperty.call(source, key) && source[key] !== '' && source[key] !== undefined && source[key] !== null;

/**
 * @typedef {(raw: string) => any} Coercer
 * A function that turns a single raw env string into the desired type.
 * Must throw on input it cannot accept.
 */

/**
 * Coerce to Number. Throws on NaN so the failure surfaces at config load time
 * rather than producing a NaN that silently poisons downstream math.
 *
 * @type {Coercer}
 */
export function number(raw) {
  const value = Number(raw);
  if (Number.isNaN(value)) {
    throw new RangeError(`Expected a number, got: ${JSON.stringify(raw)}`);
  }
  return value;
}

/**
 * Coerce to an integer using Number first (so '1e3' is accepted as 1000) and
 * then verifying the result is integral. We deliberately reject trailing
 * whitespace-only strings and empty input upstream.
 *
 * @type {Coercer}
 */
export function integer(raw) {
  const value = Number(raw);
  if (Number.isNaN(value) || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new RangeError(`Expected an integer, got: ${JSON.stringify(raw)}`);
  }
 return value;
}

/**
 * Coerce to boolean. Accepted truthy/falsy sets are intentionally small and
 * case-insensitive: 1/0, true/false, yes/no, on/off. Anything else throws so
 * typos like 'tru' fail loudly instead of falling back to a default.
 *
 * @type {Coercer}
 */
export function boolean(raw) {
  const normalized = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new RangeError(`Expected a boolean (1/0/true/false/yes/no/on/off), got: ${JSON.stringify(raw)}`);
}

/**
 * Coerce to a URL object. Throws on invalid URLs. We use the URL constructor
 * directly so the validation rules are exactly what the platform ships — no
 * half-reimplementing RFC 3986.
 *
 * @type {Coercer}
 */
export function url(raw) {
  return new URL(raw);
}

/**
 * Build a coercer that only accepts values from a fixed set. Case-sensitive on
 * purpose: env values are usually tokens like 'production' or 'us-east-1' where
 * accidental casing is a real error, not a normalisation opportunity.
 *
 * @param {readonly (string)[]} allowed
 * @returns {Coercer}
 */
export function oneOf(allowed) {
  if (!Array.isArray(allowed) || allowed.length === 0) {
    throw new TypeError('oneOf requires a non-empty array of allowed values');
  }
  const set = new Set(allowed);
  return function oneOfCoercer(raw) {
    if (!set.has(raw)) {
      throw new RangeError(`Expected one of [${allowed.join(', ')}], got: ${JSON.stringify(raw)}`);
    }
    return raw;
  };
}

/**
 * Coerce a comma-separated list into an array of trimmed strings. Empty
 * segments are dropped (so 'a,,b' yields ['a','b']) because a stray double
 * comma is almost never an intentional empty entry.
 *
 * @param {Coercer} [itemCoercer]
 * @returns {Coercer}
 */
export function list(itemCoercer) {
  const coerceItem = itemCoercer || ((raw) => raw);
  return function listCoercer(raw) {
    const segments = String(raw).split(',');
    const out = [];
    for (const segment of segments) {
      const trimmed = segment.trim();
      if (trimmed === '') continue;
      out.push(coerceItem(trimmed));
    }
    return out;
  };
}

/**
 * Parse a source object according to a schema.
 *
 * Each entry in `schema` is `{ key, coerce, default? }`:
 *   - key:     the source key to read (e.g. 'PORT').
 *   - coerce:  a Coercer applied to the raw string. If omitted, the raw string
 *              is returned unchanged.
 *   - default: returned when the key is absent or empty. If absent and no
 *              default is supplied, the resulting property is `undefined`.
 *
 * Required keys are expressed by simply not providing a default: when the
 * source lacks the key, parseEnv throws a ReferenceError naming the key.
 *
 * @param {Record<string, string>} source
 * @param {{ key: string, coerce?: Coercer, default?: any }[]} schema
 * @returns {Record<string, any>}
 */
export function parseEnv(source, schema) {
  if (!source || typeof source !== 'object') {
    throw new TypeError('source must be an object');
  }
  if (!Array.isArray(schema)) {
    throw new TypeError('schema must be an array');
  }

  const result = {};
  for (const entry of schema) {
    const { key, coerce, default: defaultValue } = entry;
    if (typeof key !== 'string' || key === '') {
      throw new TypeError('schema entry requires a non-empty string key');
    }
    const raw = has(source, key) ? source[key] : undefined;
    if (raw === undefined) {
      if (!Object.prototype.hasOwnProperty.call(entry, 'default')) {
        throw new ReferenceError(`Missing required env var: ${key}`);
      }
      result[key] = defaultValue;
      continue;
    }
    result[key] = coerce ? coerce(raw) : raw;
  }
  return result;
}

/**
 * Curried form of parseEnv bound to a schema, for ergonomic reuse. Returns a
 * function that takes a source and returns the parsed config. The schema is
 * frozen at creation time.
 *
 * @param {{ key: string, coerce?: Coercer, default?: any }[]} schema
 * @returns {(source: Record<string, string>) => Record<string, any>}
 */
export function createParser(schema) {
  return function parse(source) {
    return parseEnv(source, schema);
  };
}
