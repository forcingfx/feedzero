# ADR 002: Encryption Approach

## Status
Accepted

## Context
Privacy-first design requires all feed/article data to be encrypted at rest in IndexedDB.

## Decision
- Key derivation: PBKDF2 with 100,000 iterations, SHA-256 hash
- Encryption: AES-GCM with 256-bit keys
- Each record gets a random 12-byte IV
- Salt is 16 bytes, stored unencrypted in the `meta` store
- All operations use Web Crypto API (no external libraries)

## Rationale
- PBKDF2 is well-supported in Web Crypto and resistant to brute force at 100k iterations
- AES-GCM provides both confidentiality and integrity (authentication tag)
- Random IV per record prevents ciphertext correlation
- Web Crypto API is hardware-accelerated in modern browsers
- No external dependencies reduces attack surface

## Consequences
- Data cannot be recovered without the passphrase
- Currently using a default passphrase — production needs user-supplied passphrase
- Key rotation requires re-encrypting all records
- Performance impact is minimal (AES-GCM is fast, PBKDF2 runs once at startup)
