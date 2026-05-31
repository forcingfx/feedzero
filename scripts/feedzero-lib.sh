# shellcheck shell=sh
# Pure helpers for the FeedZero self-host CLI (scripts/feedzero).
#
# No side effects, no Docker, no I/O — just hostname classification and the
# Caddyfile-selection rule. Kept in its own file so it can be sourced by the
# CLI and exercised directly by tests (tests/scripts/feedzero-cli.test.ts)
# without a running Docker daemon. See docs/self-hosting.md.

# Classify a HOSTNAME value by how Caddy must obtain a TLS certificate.
#
# Echoes exactly one of:
#   empty     — not set yet
#   example   — still the .env.example placeholder
#   ip        — IPv4/IPv6 literal (Let's Encrypt cannot issue certs for IPs)
#   localhost — localhost or a *.local mDNS name (no public CA either)
#   domain    — a real public hostname (eligible for Let's Encrypt)
classify_hostname() {
  host="${1:-}"

  case "$host" in
    "") echo empty; return 0 ;;
    feedzero.example.com) echo example; return 0 ;;
    localhost | localhost:*) echo localhost; return 0 ;;
    \[*\]*) echo ip; return 0 ;; # bracketed IPv6, e.g. [::1]:443
  esac

  # Drop an optional :port before the IPv4/domain checks. (IPv6 literals are
  # handled above via the bracket form or the multi-colon check below.)
  hostonly="${host%%:*}"

  case "$hostonly" in
    *.local) echo localhost; return 0 ;; # mDNS — internal TLS, like localhost
  esac

  # IPv4: four dot-separated numeric octets.
  if printf '%s' "$hostonly" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo ip
    return 0
  fi

  # Bare IPv6 literal (two or more colons), e.g. fe80::1.
  case "$host" in
    *:*:*) echo ip; return 0 ;;
  esac

  echo domain
}

# Echo the Caddyfile path whose TLS mode matches the hostname.
#   ip / localhost  -> ./Caddyfile.lan  (tls internal, self-signed)
#   everything else -> ./Caddyfile      (automatic Let's Encrypt)
caddyfile_for_hostname() {
  case "$(classify_hostname "${1:-}")" in
    ip | localhost) echo "./Caddyfile.lan" ;;
    *) echo "./Caddyfile" ;;
  esac
}
