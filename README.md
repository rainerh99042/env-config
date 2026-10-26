# env-config

Read values from a source object (typically `process.env`) into a typed config object, coercing strings into the shapes your application actually wants.

```js
import { parseEnv, integer, boolean, oneOf } from 'env-config';

const config = parseEnv(process.env, [
  { key: 'PORT', coerce: integer, default: 3000 },
  { key: 'DEBUG', coerce: boolean, default: false },
  { key: 'NODE_ENV', coerce: oneOf(['dev', 'staging', 'prod']), default: 'dev' }
]);
// config.PORT   -> number
// config.DEBUG  -> boolean
// config.NODE_ENV -> 'dev' | 'staging' | 'prod' (defaults to 'dev')
```

For reuse, `createParser(schema)` returns a function bound to a schema so you can define it once and parse multiple sources.

## Why

Environment variables arrive as strings. Asking the rest of your code to remember that `PORT` is a number or `DEBUG` is a boolean is how you get `"3000" + 1 === "30001"`. This library makes the coercion explicit and loud: bad values throw at load time instead of silently producing `NaN` or truthy strings. It has zero dependencies and a tiny surface area — the whole thing is a handful of pure functions you can read in one sitting.

The trade-off is that there is no layered `.env`-file loader or schema validation language. If you want file loading, layer it yourself; this library only knows how to read keys from the object you hand it.

## Awkward edges

- **Empty strings are treated as absent.** A line like `PORT=` in a shell or `.env` file produces an empty string, and this library reads that as "not set" and falls back to the default (or throws if the key is required). If you need to accept empty strings as real values, read the source object directly instead of going through `parseEnv`.
- **`oneOf` is case-sensitive.** `Prod` and `prod` are different values. This is intentional: env tokens are usually fixed enumerations where accidental casing is a typo, not a variant to normalise.
- **`integer` accepts scientific notation** (`1e3` → `1000`) because `Number` does. If you only want decimal digits, validate with a regex before calling.

## Exports

- `parseEnv(source, schema)` — parse a source object against a schema array of `{ key, coerce?, default? }`.
- `createParser(schema)` — curried `parseEnv` bound to a fixed schema.
- Coercers: `number`, `integer`, `boolean`, `url`, `oneOf(allowed)`, `list(itemCoercer?)`.

## Running the tests

```
node --test test/*.test.js
```

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

