# Clean Code rules

Working code-review checklist (adapted from [Lukaszuk's clean-code summary](https://gist.github.com/wojteklu/73c6914cc446146b8b533c0988cf8d29) of Martin's *Clean Code*).

**General** — Follow surrounding-code conventions. Keep it simple. Boy Scout Rule (leave files cleaner). Always find the root cause; a symptom-fix that doesn't explain the symptom is a bug waiting to recur.

**Design** — Push configurable data to high levels. Prefer polymorphism / dispatch tables to long `if/else` or `switch`; state machines live in dedicated modules. Use dependency injection over globals/singletons. Law of Demeter — no `a.b().c().d()` chains. Don't over-configure; flags and toggles are debt. When N call sites repeat the same M-step dance, extract a helper — the win is not LOC, it's making intentional omissions visible (see the Key Patterns rule). When a single component branches on `pathname` for more than two routes, you are writing a router by hand — use the router instead.

**Names** — Descriptive, unambiguous, pronounceable, searchable. `i`/`j`/`tmp` only in tight obvious loops. Replace magic numbers with named constants. Meaningful distinctions (`userInfo` vs `userData` is a smell). No type-encoding prefixes (`strName`, `IUser`).

**Functions** — Small (one screen max — extract). Do one thing — the name describes it fully. Fewer arguments (three is plenty; five is a refactor). No side effects beyond what the name says. No flag arguments — split into two functions.

**Comments** — Explain in code first (rename, extract, restructure). Don't repeat what code says. Delete commented-out code — git remembers. Use comments for *why*: hidden constraints, surprising trade-offs, bug references.

**Structure** — Vertical blank lines separate concepts; related code stays vertically dense. Declare variables close to use. Callees below callers (top-down readability). Short lines. Don't horizontally align `=` or types.

**Objects and data structures** — Hide internal structure; don't return mutable references that callers mutate. Prefer plain TypeScript types for transport between modules; reserve classes for behavior with invariants. Small, few fields, single responsibility. Composition over inheritance.

**Tests** — One logical assertion per test (multiple `expect()` for one assertion is fine). Readable (a worked example of how to use the unit). Independent. Repeatable (no clocks, unseeded random, or external network in unit tests). Fast — the full suite is ~9s; keep it that way.

**Code smells vocabulary** — Rigidity (small change cascades), Fragility (change here breaks unrelated there), Immobility (can't reuse, tangled in context), Needless complexity (anticipated requirements that never came), Needless repetition (copy-paste instead of extraction), Opacity (intent unclear at a glance).
