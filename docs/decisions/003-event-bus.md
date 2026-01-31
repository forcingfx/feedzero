# ADR 003: Event Bus for Component Communication

## Status
Accepted

## Context
UI components and core modules need to communicate without tight coupling.

## Decision
Use a simple synchronous pub/sub event bus with wildcard (`*`) support. Components never reference each other directly — `main.js` wires them together through events.

## Rationale
- Loose coupling: components are independently testable
- Simple: ~30 lines of code, no external library
- Wildcard support enables debugging/logging listeners
- Unsubscribe functions prevent memory leaks
- Synchronous emit keeps data flow predictable and easy to trace

## Consequences
- No event ordering guarantees beyond registration order
- No built-in async event support (handlers run synchronously)
- Debugging requires a wildcard listener to trace all events
- Event name typos fail silently — mitigated by using constants
