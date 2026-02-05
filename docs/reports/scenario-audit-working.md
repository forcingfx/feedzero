# Scenario Audit Working Document

## Master Scenario List

### Feature 001: Add and Parse Feeds (10 scenarios)

| ID | Scenario | Test Status | Test Location |
|----|----------|-------------|---------------|
| 001-S01 | Valid Atom feed URL | ❓ | |
| 001-S02 | Valid JSON Feed URL | ❓ | |
| 001-S03 | Empty URL rejected | ❓ | |
| 001-S04 | Invalid URL rejected | ❓ | |
| 001-S05 | Unreachable URL | ❓ | |
| 001-S06 | URL returns non-feed content | ❓ | |
| 001-S07 | Duplicate feed URL | ❓ | |
| 001-S08 | Feed selected shows articles | ❓ | |
| 001-S09 | Add feed via keyboard | ❓ | |
| 001-S10 | Submit feed URL and auto-navigate | ❓ | |

### Feature 002: Persistent Storage (2 scenarios)

| ID | Scenario | Test Status | Test Location |
|----|----------|-------------|---------------|
| 002-S01 | Feeds survive browser restart | ❓ | |
| 002-S02 | Wrong passphrase cannot read data | ❓ | |

### Feature 003: Full-Text Extraction (3 scenarios)

| ID | Scenario | Test Status | Test Location |
|----|----------|-------------|---------------|
| 003-S01 | User requests extracted content | ❓ | |
| 003-S02 | Extracted content matches feed content | ❓ | |
| 003-S03 | Page fetch fails | ❓ | |

### Feature 004: Feed Discovery (5 scenarios)

| ID | Scenario | Test Status | Test Location |
|----|----------|-------------|---------------|
| 004-S01 | User enters a direct feed URL | ❓ | |
| 004-S02 | User enters a bare domain | ❓ | |
| 004-S03 | User enters a website URL with autodiscovery | ❓ | |
| 004-S04 | User enters a website URL without autodiscovery | ❓ | |
| 004-S05 | No feed can be found | ❓ | |

### Feature 005: Feed Refresh (7 scenarios)

| ID | Scenario | Test Status | Test Location |
|----|----------|-------------|---------------|
| 005-S01 | Auto-refresh on app load | ❓ | |
| 005-S02 | Manual refresh all feeds | ❓ | |
| 005-S03 | Manual refresh single feed | ❓ | |
| 005-S04 | Duplicate articles are skipped | ❓ | |
| 005-S05 | Double-click prevention | ❓ | |
| 005-S06 | Refresh via keyboard | ❓ | |
| 005-S07 | R key while refreshing is ignored | ❓ | |

### Feature 006: Content View Toggle (12 scenarios)

| ID | Scenario | Test Status | Test Location |
|----|----------|-------------|---------------|
| 006-S01 | Viewing an article | ❓ | |
| 006-S02 | Summary is similar or absent | ❓ | |
| 006-S03 | Summary is distinct | ❓ | |
| 006-S04 | Feed provides full content | ❓ | |
| 006-S05 | Description-only feed with substantial content | ❓ | |
| 006-S06 | Description-only feed with short content | ❓ | |
| 006-S07 | Feed has only a teaser | ❓ | |
| 006-S08 | Extraction adds substantial content | ❓ | |
| 006-S09 | Extraction adds only boilerplate | ❓ | |
| 006-S10 | Single mode | ❓ | |
| 006-S11 | Timestamps display with time | ❓ | |
| 006-S12 | Toggle view with E key / Toggle back | ❓ | |

### Feature 007: Remove Feed (3 scenarios)

| ID | Scenario | Test Status | Test Location |
|----|----------|-------------|---------------|
| 007-S01 | Remove a feed | ❓ | |
| 007-S02 | Cancel removal | ❓ | |
| 007-S03 | Remove does not trigger selection | ❓ | |

### Feature 008: Zero-Knowledge Sync (9 scenarios)

| ID | Scenario | Test Status | Test Location |
|----|----------|-------------|---------------|
| 008-S01 | New user enables sync during onboarding | ❓ | |
| 008-S02 | Returning sync user opens the app | ❓ | |
| 008-S03 | Recovering on a new device | ❓ | |
| 008-S04 | Data changes trigger sync | ❓ | |
| 008-S05 | User disables sync | ❓ | |
| 008-S06 | User logs out (clear local, keep cloud) | ❓ | |
| 008-S07 | Refresh pulls cross-device changes first | ❓ | |
| 008-S08 | Local-only user enables sync later | ❓ | |
| 008-S09 | Server never sees plaintext | ❓ | |

### Feature 009: Keyboard Navigation (24 scenarios)

| ID | Scenario | Test Status | Test Location |
|----|----------|-------------|---------------|
| 009-S01 | Navigate to next article with J | ❓ | |
| 009-S02 | Navigate to previous article with K | ❓ | |
| 009-S03 | J at last article stays at last | ❓ | |
| 009-S04 | K at first article stays at first | ❓ | |
| 009-S05 | J/K with no articles does nothing | ❓ | |
| 009-S06 | Navigate to next feed with U | ❓ | |
| 009-S07 | Navigate to previous feed with I | ❓ | |
| 009-S08 | U at last feed stays at last | ❓ | |
| 009-S09 | I at first feed stays at first | ❓ | |
| 009-S10 | Open original link | ❓ | |
| 009-S11 | O with no article selected does nothing | ❓ | |
| 009-S12 | Toggle from Feed to Extracted | ❓ | |
| 009-S13 | Toggle from Extracted back to Feed | ❓ | |
| 009-S14 | E with cached extraction uses cache | ❓ | |
| 009-S15 | E with no article selected does nothing | ❓ | |
| 009-S16 | Open add feed form | ❓ | |
| 009-S17 | Close form with Escape | ❓ | |
| 009-S18 | Close sidebar | ❓ | |
| 009-S19 | Open sidebar | ❓ | |
| 009-S20 | Refresh all feeds | ❓ | |
| 009-S21 | R while already refreshing is ignored | ❓ | |
| 009-S22 | Shortcuts ignored when typing in input | ❓ | |
| 009-S23 | Shortcuts ignored when typing in textarea | ❓ | |
| 009-S24 | Shortcuts ignored in contenteditable | ❓ | |

### Feature 010: Mobile Navigation (6 scenarios)

| ID | Scenario | Test Status | Test Location |
|----|----------|-------------|---------------|
| 010-S01 | Back from article shows article list | ❓ | |
| 010-S02 | Back from article list shows feed sidebar prompt | ❓ | |
| 010-S03 | Back button is hidden at root | ❓ | |
| 010-S04 | User can browse article list after Back | ❓ | |
| 010-S05 | Mobile shows one content panel at a time | ❓ | |
| 010-S06 | Desktop shows multi-panel layout | ❓ | |

---

## Total: 81 scenarios to verify
