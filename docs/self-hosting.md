# Self-hosting FeedZero

Zero to running, in about half an hour, on Linux, macOS, or Windows.

If you're new to self-hosting: this is friendlier than it looks. The
hard parts (TLS certs, reverse proxy config, encrypted storage) are
already wired together. You provide a hostname and a server; the
stack provisions the rest.

## Contents

1. [Before you start](#before-you-start) — prerequisites
2. [Five-minute deploy with a public hostname](#five-minute-deploy-with-a-public-hostname)
3. [LAN-only deploy](#lan-only-deploy) — no domain, no port-forwarding
4. [Day-2 operations](#day-2-operations) — update, back up, restore
5. [Troubleshooting](#troubleshooting)
6. [What you give up vs. the hosted version](#what-you-give-up-vs-the-hosted-version)

---

## Before you start

### A server

Any of these works. FeedZero is small — a few hundred MB of RAM, a
few hundred MB of disk plus your feed cache.

- A small VPS (Hetzner, Vultr, DigitalOcean, etc.) for €4–6/month.
- A Raspberry Pi 4 or 5 on your home network. (The image is multi-arch,
  including `arm64`.)
- An old laptop with Linux that you never turn off.

The server needs a static or stable IP — DHCP-managed home networks
work fine if you give it a reservation.

### A hostname (or use DuckDNS for free)

You need a DNS name that points at the server. Caddy uses it to
fetch a TLS certificate from Let's Encrypt.

- **You own a domain?** Add an A record (and AAAA if your server has
  IPv6) for `feedzero.your-domain.com` pointing at the server's
  public IP. Wait a few minutes for DNS to propagate; check with
  `dig feedzero.your-domain.com` (Linux/macOS) or
  `Resolve-DnsName feedzero.your-domain.com` (Windows PowerShell).
- **You don't?** Sign up at <https://www.duckdns.org/> (free, no
  email needed — login with GitHub/Google). Pick a subdomain like
  `your-name.duckdns.org` and point it at your server's public IP.
  The setup takes 3 minutes.

### Ports 80 and 443 open

Caddy needs port 80 to satisfy Let's Encrypt's HTTP-01 challenge
(used to prove the domain is yours), and port 443 to serve HTTPS.

- **VPS:** Usually open by default. Check your provider's firewall
  panel if not — UFW, Cloud Firewall, Security Groups, etc.
- **Home network:** Forward both ports on your router to the
  server's local IP. The setting is typically under "Port
  Forwarding" or "NAT" in your router admin. Some ISPs block
  inbound 80/443 on residential connections — in that case, use a
  free Cloudflare Tunnel or a VPS instead.

### Docker

Both the FeedZero container and the Caddy reverse proxy run as
Docker images. You need Docker Engine + the Compose v2 plugin.

#### macOS or Windows

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/).
The Compose plugin ships in the box. Verify after install:

```bash
docker --version          # 24.x or newer
docker compose version    # 2.x or newer
```

#### Linux (Ubuntu / Debian)

Docker Desktop on Linux is heavy; use the engine + plugin instead.
The one-liner from <https://get.docker.com> works on most distros:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER       # log out + back in for this to take effect
docker --version
docker compose version
```

For Fedora, Alpine, Arch, etc., follow
<https://docs.docker.com/engine/install/>.

### Git (or just download the bundle)

You'll fetch FeedZero's deploy files. Either:

```bash
# With git
git clone https://github.com/forcingfx/feedzero.git
cd feedzero
```

Or — if you don't want git — download just what you need:

```bash
# Linux / macOS
curl -L https://github.com/forcingfx/feedzero/archive/main.tar.gz | tar xz
cd feedzero-main
```

```powershell
# Windows PowerShell
Invoke-WebRequest -OutFile feedzero.zip `
  https://github.com/forcingfx/feedzero/archive/main.zip
Expand-Archive feedzero.zip
cd feedzero-main\feedzero-main
```

---

## Five-minute deploy with a public hostname

Once you've finished the prerequisites above, deployment is three
commands.

### 1. Copy the env template and edit it

```bash
# Linux / macOS / WSL2 / Git Bash
cp .env.example .env
nano .env             # or vim, or your favourite editor
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env
notepad .env
```

Set at least `HOSTNAME`. `ACME_EMAIL` is recommended; leave the rest
on defaults.

```env
HOSTNAME=feedzero.your-domain.com
ACME_EMAIL=you@example.com
FEEDZERO_VERSION=latest
DATA_DIR=./data
```

### 2. Sanity-check the environment

```bash
# Linux / macOS / WSL2 / Git Bash
./scripts/feedzero doctor
```

```powershell
# Windows PowerShell
pwsh .\scripts\feedzero.ps1 doctor
```

You should see four green checks. If anything fails, fix it before
moving on — `up` will fail in worse ways downstream.

### 3. Start the stack

```bash
# Linux / macOS / WSL2 / Git Bash
./scripts/feedzero up
```

```powershell
# Windows PowerShell
pwsh .\scripts\feedzero.ps1 up
```

The first run builds the FeedZero image locally (5–10 minutes on a
Pi, 1–2 on a modern VPS). Subsequent `up` calls reuse the cached
image. After the first official release ships a published image to
GHCR, the `update` command (below) pulls it in seconds instead of
building.

While it's working, watch the logs for the Let's Encrypt cert
provisioning:

```bash
./scripts/feedzero logs caddy
```

Look for `certificate obtained successfully` from Caddy. Once you
see that — usually 10–30 seconds after first boot — visit
`https://feedzero.your-domain.com` in your browser.

### 4. Save your passphrase

On first launch, FeedZero generates a 4-word passphrase and stores
the keys derived from it in your browser's IndexedDB. **Save the
passphrase somewhere you trust** (password manager, encrypted notes).
The passphrase is the only thing that can decrypt your data if you
clear your browser or switch devices. FeedZero will never see it
again, and the server doesn't have it.

---

## LAN-only deploy

No domain? No port-forwarding? You can run FeedZero on your home
network with self-signed certs that you trust on each device.

### 1. Edit `Caddyfile`

Open `Caddyfile` and swap which block is commented:

```caddyfile
# {$HOSTNAME} {
#     reverse_proxy feedzero:3000
#     encode zstd gzip
# }

:443 {
    tls internal
    reverse_proxy feedzero:3000
    encode zstd gzip
}
```

`tls internal` makes Caddy mint its own root certificate authority
and self-signed leaf certs.

### 2. Set HOSTNAME to your server's LAN address

You still need a value (compose enforces it). Use the LAN IP or a
local mDNS name:

```env
HOSTNAME=192.168.1.42
# or
HOSTNAME=homelab.local
```

### 3. Start

Same `feedzero up` as the public path.

### 4. Trust the Caddy root CA on each client device

FeedZero requires HTTPS (Web Crypto refuses to run otherwise), so
your browser will reject Caddy's self-signed cert until you trust
its root.

Find the root cert: after `feedzero up`, run

```bash
docker exec feedzero-caddy cat /data/caddy/pki/authorities/local/root.crt > caddy-root.crt
```

Then install it as a trusted root on each device that will use
FeedZero:

- **macOS:** Open `caddy-root.crt`, drag into Keychain Access →
  *System*. Right-click the cert → *Get Info* → expand *Trust* →
  set *When using this certificate* to *Always Trust*.
- **Linux (Ubuntu/Debian):**
  `sudo cp caddy-root.crt /usr/local/share/ca-certificates/ &&
   sudo update-ca-certificates`.
- **Windows:** Right-click `caddy-root.crt` → *Install Certificate*
  → *Local Machine* → *Place all certificates in the following
  store* → *Trusted Root Certification Authorities*.
- **iOS:** AirDrop the file, open in Files, install as a profile
  under Settings → General → VPN & Device Management. Then
  Settings → General → About → Certificate Trust Settings → enable.
- **Android:** Settings → Security → Encryption & credentials →
  Install a certificate → CA certificate. Some phone vendors hide
  this under different paths.

After trusting the root, visit `https://192.168.1.42` (or whatever
your `HOSTNAME` is) and FeedZero loads cleanly.

---

## Day-2 operations

### Update

When a new FeedZero version ships, pull and recreate:

```bash
./scripts/feedzero update
```

```powershell
pwsh .\scripts\feedzero.ps1 update
```

The script pulls the latest image, recreates the containers, and
tails 20 lines of logs so you can confirm a clean restart. Total
time: ~30 seconds for an unchanged base layer, longer on the first
update.

To pin a specific version, set `FEEDZERO_VERSION=v0.9.1` in `.env`
and run `update`. Without a pin, the script tracks `:latest`.

#### Image registry: GHCR or Docker Hub

Every release is published to both registries:

- **GitHub Container Registry** (default in `docker-compose.yml`):
  `ghcr.io/forcingfx/feedzero`
- **Docker Hub**: `docker.io/forcingfx/feedzero`

If you'd rather pull from Docker Hub — common when managing the
stack from Portainer's LAN-only UI, which lists Docker Hub by default —
edit the `image:` line in `docker-compose.yml`:

```yaml
image: docker.io/forcingfx/feedzero:${FEEDZERO_VERSION:-latest}
```

Both registries serve the same multi-arch artefact, so the swap is
otherwise invisible.

#### Portainer (LAN-only)

If you manage your homelab through Portainer:

1. Go to **Stacks** → **Add stack**.
2. Paste the contents of `docker-compose.yml` (swap the `image:` line
   to `docker.io/...` if you'd prefer Docker Hub).
3. In the **Environment variables** section, paste from `.env.example`
   and edit `HOSTNAME` to your LAN address.
4. Deploy. The encrypted vault and feed cache live in the bind-mount
   declared by `DATA_DIR` — backups via `./scripts/feedzero backup`
   still work the same way.

### Backup

```bash
./scripts/feedzero backup
```

Writes a timestamped `tar.gz` of the data directory under
`backups/`. Move that file off the server (rsync, scp, cloud
storage, USB stick — your call). Recommended cadence: weekly, plus
before any update.

The backup contains the encrypted vault. Without your passphrase,
the backup is unreadable — restore requires the same passphrase the
data was created with.

### Restore

```bash
./scripts/feedzero restore backups/feedzero-2026-05-19T120000Z.tar.gz
```

The script asks before overwriting. It stops the stack, replaces the
data dir, and prints `Restart with: ./scripts/feedzero up` when
done.

### Read the logs

```bash
./scripts/feedzero logs              # all services
./scripts/feedzero logs feedzero     # just the app
./scripts/feedzero logs caddy        # just the reverse proxy
```

---

## Troubleshooting

### "TLS certificate error" in the browser

- **DNS hasn't propagated yet.** Wait 5 minutes, then reload. Verify
  with `dig HOSTNAME` (Linux/macOS) or `Resolve-DnsName HOSTNAME`
  (PowerShell) — the response should be your server's IP.
- **Port 80 is blocked.** Let's Encrypt's HTTP-01 challenge needs
  it. Check `./scripts/feedzero logs caddy` for `connection
  refused` from the Let's Encrypt validator.
- **Hit Let's Encrypt's rate limit** during testing. Caddy logs
  show `too many failed authorizations recently`. The limit
  resets in an hour; meanwhile use `tls internal` (the LAN-only
  block) for testing.

### "Web Crypto refused to run" / app shows a security warning

You're loading FeedZero over plain HTTP. Browsers gate the Web
Crypto API behind a secure context. Either:

- Visit the `https://` URL (Caddy serves it), not `http://...:3000`.
- If you're on LAN-only, make sure you trusted the root CA on this
  device (see [LAN-only deploy](#lan-only-deploy)).

### Feeds time out / fail with 429s

Self-hosted FeedZero shares no IP reputation with the hosted version.
Some upstreams (Cloudflare-class WAFs) treat fresh datacenter IPs
suspiciously. The browser-like User-Agent default (ADR 014) mitigates
this, but persistent 429s on a specific source are usually upstream
rate-limits — wait, or set `FEED_USER_AGENT` in `.env` to a contact
UA the upstream operator will whitelist.

### `feedzero up` fails: "Image not found"

The pre-built GHCR image doesn't exist until the first release tag
publishes one. The `up` script passes `--build` to compensate, so a
build-from-source falls back automatically. If it still fails, check
the build logs for missing tools (gcc, python — build deps for
sharp-style packages):

```bash
docker compose build --no-cache feedzero 2>&1 | tail -50
```

### `feedzero doctor` says HOSTNAME is the example value

Edit `.env` and set `HOSTNAME` to the domain you actually own.
`feedzero.example.com` is the placeholder; Let's Encrypt can't
issue a cert for it.

### Sync isn't working across devices

Both devices need:

- The **same passphrase** (FeedZero will derive the same vault ID
  on both).
- Network access to your `HOSTNAME`. If device B is outside your
  home network, `homelab.local` won't resolve — use a public
  hostname or a VPN.

If the first device works but a second device fails restore, the
most likely cause is a typo in the passphrase. The server returns
`Vault not found`; FeedZero translates that to a human message.

### Containers won't start at boot

The compose file sets `restart: unless-stopped` for both services,
which survives reboots. If you ran `docker compose down` (which
counts as "user stopped it"), they'll stay down. Use `feedzero up`
to restart them; that resets the flag.

---

## What you give up vs. the hosted version

Self-hosting is supported but not magical. Things you lose by going
solo:

- **Upstream rate-limiting.** The hosted deployment uses an Upstash
  Redis to smooth bursts; without it, a bulk refresh on a fresh IP
  can trigger upstream 429s. Symptoms: feeds work on
  `my.feedzero.app` but fail locally.
- **IP reputation.** Hosted FeedZero shares datacenter IPs known to
  upstreams. Fresh residential or VPS IPs may be blocked by
  Cloudflare-class WAFs.
- **Managed backups.** The hosted deployment snapshots its sync
  storage. You're responsible for `feedzero backup` and getting
  those files off the server.
- **Automatic updates.** The hosted deployment ships continuous
  deploys. Self-host updates land when you run `feedzero update`.
  (This is a feature, not a bug — you decide when to take risk.)

See [ADR 014: self-host is first-class](./decisions/014-self-host-first-class.md)
for the design rationale and the messaging-lesson incident that
prompted it.
