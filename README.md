# Plex Kids

A YouTube Kids-style web app for your local Plex Media Server. Each kid picks their profile
(a Plex Home managed user), gets a customizable home page of rails, and taps to play — no Plex
login on their device. Designed for iPads on a local network or over Tailscale.

Built as a backend-for-frontend: the browser only ever talks to this app; the app talks to
Plex. So kids' devices never need direct access to your Plex server or a Plex token.

## Features

- **Profiles = Plex Home managed users.** Library access and content-rating restrictions are
  enforced by Plex per user — a kid only ever sees (and can play) what Plex allows them.
- **Plex-native progress.** Resume + Continue Watching come from Plex; watch history syncs back.
- **Customizable home** per profile: toggleable rails (Continue Watching, Next Up, Recently
  Added, Watch Again, a row per library, Short Picks) plus a "Wild Card" random feed.
- **PIN-guarded settings.** Sign in with Plex once to bootstrap; a PIN guards day-to-day access.
- Profile photos pulled from Plex; favorites; search.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Compose
- A running [Plex Media Server](https://www.plex.tv/media-server-downloads/) with
  [Plex Home](https://support.plex.tv/articles/203815766-what-is-plex-home/) managed users for
  your kids (set each one's library access + content-rating limits in Plex → Users & Sharing)

## Setup

1. **Configure**
   ```bash
   cp docker-compose.example.yml docker-compose.yml
   ```
   Set **`PLEX_SERVER`** (your Plex URL — see note). That's the only required value:
   `SESSION_SECRET` is auto-generated on first boot if unset, and you do **not** need a Plex
   token in the file (you sign in from the app — step 3).

   > **PLEX_SERVER**: inside the container `localhost` is the container itself. Use the host's
   > LAN IP — e.g. `http://192.168.1.x:32400` — or `http://host.docker.internal:32400` on
   > Docker Desktop for Mac/Windows.

2. **Run**
   ```bash
   docker compose up -d
   ```
   The example compose pulls the prebuilt image from GHCR — no build needed. (To build from
   source instead, switch the `image:` line to `build: .` and run `docker compose up -d --build`.)

3. **First-run bootstrap** — open `http://localhost:6767` (or your server's IP; if you changed
   the host port in the `ports:` mapping, use that one), tap the ⚙️ gear on the profile picker,
   **Sign in with Plex** as the server owner, then **set a PIN**. That stores the admin token in
   the config volume and locks settings behind the PIN.

4. **Done.** Your Plex Home managed users appear as profiles automatically. Share a library to
   a kid in Plex (with whatever content-rating limit) and it shows up as a rail for them — no
   config change here.

## Remote access (optional)

Serve it privately over your tailnet with [Tailscale](https://tailscale.com):
```bash
tailscale serve --bg http://localhost:6767
```
Kids' devices just need the Tailscale app and the resulting `https://<host>.<tailnet>.ts.net`
URL. (Tailscale **Funnel** would make it public — not recommended for a kids' app.)

## Useful commands

```bash
docker-compose logs -f                            # tail logs
docker-compose down                               # stop and remove
curl -X POST http://localhost:6767/api/cache/refresh   # pick up new Plex content/shares now
```

## Customizing profiles & home

- **Who appears / hidden profiles, PIN lock:** the gated ⚙️ Settings page.
- **Each profile's home layout** (which rails, Wild Card libraries): the ✨ Customize button on
  the home screen.
- **Cosmetic profile styling** (emoji/color fallback when a user has no Plex photo): `src/profiles.js`.

## Development (without Docker)

Requires Node.js 20+.
```bash
npm install
npm run build
node server.js    # serves on :6767
```
For hot-reload, run `npm run dev` (Vite :5173) and `npm run server` (:6767) separately. Note:
API calls fail at `:5173` (no proxy configured) — use the production build for end-to-end testing.

## Migrating to a new host

Copy the `plex-kids-config/` volume to the new host (preserves the admin token + settings — or
just re-sign-in from the app to bootstrap a fresh one), update `PLEX_SERVER` to the new Plex
address, and re-establish `tailscale serve` (give the new host the same tailnet node name to
keep the URL stable).

## Version history

This is published as a clean snapshot; the highlights of how it got here:

| Version | Highlights |
|---|---|
| **v3.7** | Responsive layout — fluid `clamp()` sizing scales from phone to iPad to desktop; uniform media-card sizing. |
| **v3.6** | Horizontal scrolling rails; per-user item pools so Plex content-rating restrictions hide disallowed titles; Plex owns library visibility per managed user. |
| **v3.5** | Per-profile customizable home (toggleable rails) + a "Wild Card" random feed. |
| **v3.2–v3.4** | Settings guarded by a PIN; Plex OAuth for bootstrap/PIN reset; real Plex profile photos as user icons. |
| **v3.0–v3.1** | Plex-native architecture: progress synced to Plex (timeline + On Deck), per-user resource tokens, no hardcoded token; settings to hide profiles. |
| **v2.3** | Plex Home managed users replace the trust-based profile picker; per-user streaming attribution. |
| **v2.1–v2.2** | HTTPS HLS proxy (streaming over Tailscale); health checks; API hardening (token-exfil/SSRF fixes). |
| **v2.0** | Initial Docker port of the original pm2/Node app. |
