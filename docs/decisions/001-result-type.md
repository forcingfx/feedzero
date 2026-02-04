# ADR 001: Result Type for Error Handling

## Status
Accepted

## Context
Core functions (parsing, encryption, storage) can fail in expected ways. We need a consistent error handling strategy.

## Decision
Use a Result type pattern: `{ok: true, value}` for success, `{ok: false, error}` for failure. All core functions return Result instead of throwing.

## Rationale
- Explicit: callers must handle errors — they can't forget to try/catch
- Composable: `map`, `mapErr`, `unwrapOr` enable functional error pipelines
- No hidden control flow: exceptions break call stacks and are easy to miss
- Lightweight: plain objects, no class hierarchy

## Consequences
- Slightly more verbose than throw/catch at call sites
- Callers must check `.ok` before accessing `.value`
- `unwrap()` is available for cases where failure is truly unexpected (throws)

## Updates

### andThen / fromPromise helpers (2025)
Added `andThen(result, fn)` for chaining Result-returning operations and `fromPromise(promise, mapError)` for wrapping async calls into `Result<T>`. These eliminate common boilerplate without requiring a library.

### neverthrow evaluation (2025)
Evaluated adopting [neverthrow](https://github.com/supermacro/neverthrow) (1M+ weekly downloads, MIT, 0 deps) to replace the custom Result module. Rejected because neverthrow's `Result` uses `.isOk()` method access while the entire codebase checks `.ok` as a boolean property (41+ occurrences across `src/core/` and `src/stores/`). Migrating would require rewriting every consumer with no functional benefit. The custom module (~50 lines) provides exactly the API surface needed.
