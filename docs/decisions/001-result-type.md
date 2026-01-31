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
