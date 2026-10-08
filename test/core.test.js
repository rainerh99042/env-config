import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEnv,
  number,
  integer,
  boolean,
  url,
  oneOf,
  list,
  createParser
} from '../src/core.js';

test('parseEnv returns raw string when no coerce is given', () => {
  const out = parseEnv({ NAME: 'alice' }, [{ key: 'NAME' }]);
  assert.deepEqual(out, { NAME: 'alice' });
});

test('parseEnv applies coerce when the key is present', () => {
  const out = parseEnv({ PORT: '8080' }, [{ key: 'PORT', coerce: integer }]);
  assert.deepEqual(out, { PORT: 8080 });
  assert.equal(typeof out.PORT, 'number');
});

test('parseEnv uses default when the key is absent', () => {
  const out = parseEnv({}, [{ key: 'PORT', coerce: integer, default: 3000 }]);
  assert.deepEqual(out, { PORT: 3000 });
});

test('parseEnv treats empty string as absent', () => {
  const out = parseEnv({ PORT: '' }, [{ key: 'PORT', coerce: integer, default: 3000 }]);
  assert.deepEqual(out, { PORT: 3000 });
});

test('parseEnv throws ReferenceError for missing required keys', () => {
  assert.throws(
    () => parseEnv({}, [{ key: 'MUST_EXIST', coerce: integer }]),
    (err) => err instanceof ReferenceError && /MUST_EXIST/.test(err.message)
  );
});

test('parseEnv throws ReferenceError even when key is empty string and no default', () => {
  assert.throws(
    () => parseEnv({ EMPTY: '' }, [{ key: 'EMPTY', coerce: number }]),
    (err) => err instanceof ReferenceError && /EMPTY/.test(err.message)
  );
});

test('parseEnv lets coerce errors propagate', () => {
  assert.throws(
    () => parseEnv({ X: 'abc' }, [{ key: 'X', coerce: number }]),
    RangeError
  );
});

test('number accepts negative and decimal', () => {
  assert.equal(number('-3.5'), -3.5);
  assert.equal(number('0.0001'), 0.0001);
});

test('number rejects non-numeric strings', () => {
  assert.throws(() => number('abc'), RangeError);
  assert.throws(() => number('not-a-number'), RangeError);
});

test('integer rejects non-integer numbers', () => {
  assert.throws(() => integer('1.5'), RangeError);
  assert.throws(() => integer('NaN'), RangeError);
});

test('integer accepts scientific notation representing an integer', () => {
  assert.equal(integer('1e3'), 1000);
});

test('boolean accepts the documented truthy and falsy forms', () => {
  for (const v of ['1', 'true', 'TRUE', 'yes', 'on', 'True']) {
    assert.equal(boolean(v), true, `expected true for ${v}`);
  }
  for (const v of ['0', 'false', 'FALSE', 'no', 'off', 'No']) {
    assert.equal(boolean(v), false, `expected false for ${v}`);
  }
});

test('boolean rejects anything outside the accepted set', () => {
  assert.throws(() => boolean('maybe'), RangeError);
  assert.throws(() => boolean(''), RangeError);
});

test('url returns a URL object for valid input', () => {
  const u = url('https://example.org:8443/path');
  assert.equal(u.protocol, 'https:');
  assert.equal(u.port, '8443');
  assert.ok(u instanceof URL);
});

test('url throws on invalid input', () => {
  assert.throws(() => url('not a url'), TypeError);
});

test('oneOf returns the value when in the set', () => {
  const coerce = oneOf(['dev', 'staging', 'prod']);
  assert.equal(coerce('prod'), 'prod');
});

test('oneOf is case-sensitive', () => {
  const coerce = oneOf(['dev', 'staging', 'prod']);
  assert.throws(() => coerce('Prod'), RangeError);
});

test('oneOf throws on empty allowed array at construction time', () => {
  assert.throws(() => oneOf([]), TypeError);
});

test('list splits and trims, dropping empty segments', () => {
  const coerce = list();
  assert.deepEqual(coerce(' a , b ,, c '), ['a', 'b', 'c']);
});

test('list applies an item coercer to each segment', () => {
  const coerce = list(integer);
  assert.deepEqual(coerce('1, 2, 3'), [1, 2, 3]);
});

test('list propagates item coercer errors', () => {
  const coerce = list(integer);
  assert.throws(() => coerce('1, oops, 3'), RangeError);
});

test('list returns empty array for empty string', () => {
  const coerce = list();
  assert.deepEqual(coerce(''), []);
});

test('createParser returns a function bound to the schema', () => {
  const parse = createParser([
    { key: 'PORT', coerce: integer, default: 3000 },
    { key: 'MODE', coerce: oneOf(['dev', 'prod']), default: 'dev' }
  ]);
  const out = parse({ PORT: '1234', MODE: 'prod' });
  assert.deepEqual(out, { PORT: 1234, MODE: 'prod' });
});

test('createParser uses defaults when source is sparse', () => {
  const parse = createParser([
    { key: 'A', coerce: number, default: 1 },
    { key: 'B', coerce: boolean, default: false }
  ]);
  assert.deepEqual(parse({}), { A: 1, B: false });
});

test('parseEnv validates schema entry shape', () => {
  assert.throws(
    () => parseEnv({ X: '1' }, [{ key: 123 }]),
    TypeError
  );
});

test('parseEnv rejects non-array schema', () => {
  assert.throws(() => parseEnv({}, { key: 'X' }), TypeError);
});

test('parseEnv rejects non-object source', () => {
  assert.throws(() => parseEnv(null, []), TypeError);
});
