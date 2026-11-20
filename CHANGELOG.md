# Changelog

All notable changes to Plex Kids are recorded here, newest first.
Dates are ISO (YYYY-MM-DD). Versions before 3.10.0 are backfilled from the git tag history.

## [3.12.2] — 2026-11-19 — Header clears the status bar

### Fixed
- **Pages no longer start under the clock / Dynamic Island** when Plex Kids runs from the
  home screen (it draws under a translucent status bar): page padding now includes the
  device's top safe-area inset.
- **Tighter header on phones:** the version number sits to the right of the logo in page
  headers instead of under it, so the nav-button row sits closer to the logo. The profile
  picker keeps the version underneath.

## [3.12.1] — 2026-11-19 — Home header fits phones in portrait

### Fixed
- **Home header no longer runs off the screen on a phone held upright.** The logo and the row
  of round nav buttons (made one wider by 3.12.0's 📺 toggle) didn't fit at phone portrait
  widths, so the page scrolled sideways. The logo and profile picture now stay on top and the
  nav buttons drop to their own full-width row below 700 px; landscape and iPad are unchanged.
  Checked at 375, 390, 820 and 844 px wide: no horizontal overflow.

## [3.12.0] — 2026-11-19 — Play on TV

### Added
- **Play on TV (optional).** Send a tapped movie or episode to a TV instead of playing it on the
  device — e.g. put on the exact episode a kid asks for from a parent's phone. Plex Kids asks
  Home Assistant to wake the TV and open a deep link (default: Rivulet on Apple TV,
  `rivulet://play?ratingKey=…&offset=…`), starting at the browsing profile's resume point.
  Off unless `TV_HA_URL`, `TV_HA_TOKEN` and `TV_HA_ENTITY` are set; keep them in a separate
  `tv.env` (see `tv.env.example`), not in the compose file. The token stays server-side.
- **Per-device opt-in.** Settings → Play on TV → Allowed (PIN-guarded), so kids' devices can't
  send to the TV. Allowed devices get a 📺/📱 header toggle and a now-playing bar with
  play/pause.
- `npm test` (built-in `node:test`) with unit tests for the Home Assistant client.

### Fixed before release
- Home Assistant requests time out after 15 s (one retry on network errors), so a hung HA
  shows an error instead of leaving the phone on "Sending…".
- The runtime image now ships `tv.js` (the Dockerfile copied only `server.js`, so the container
  would have crashed on startup). `tv.env` is excluded from the build context.

### Setup notes
- `env_file` is read only when the container is created: after editing `tv.env`, run
  `docker compose up -d plex-kids` — a plain `restart` won't pick it up.
- Rivulet: set Settings → Profile Picker to **Off**, or links wait at "Who's watching?". A
  one-time tvOS "Open Rivulet?" prompt may appear the first time.

### Known limitations
- Rivulet plays as its own active profile, so progress during TV playback is recorded to that
  Plex user, not the kid browsed in Plex Kids (Rivulet's links have no profile parameter yet).
- The per-device "Allowed" switch is enforced in the app; the server only requires an active
  profile session.
- A double tap while sending can send the same item twice (harmless).

Verified on an Apple TV 4K with Rivulet: woke from sleep, played the tapped episode at the
profile's resume point, and play/pause worked from the phone.

## [3.11.0] — 2026-07-15 — Continue Watching fixes + offline progress sync-back

### Fixed
- **Continue Watching now captures everything watched in the app.** `/api/continue` previously
  read Plex's `/library/onDeck`, which applies next-episode logic and *excludes whole library
  types* — notably the YouTube / personal-media library (`com.plexapp.agents.youtube`), which
  contributes zero items to On Deck. Watched items there saved a resume point in Plex but never
  resurfaced. It now queries the literal in-progress list
  (`/library/all?viewOffset>=1&sort=lastViewedAt:desc`), deduped one row per show.
- **Downloaded items now report progress.** Downloads are fragmented MP4s (`empty_moov`) with no
  header duration, so `video.duration` reads `Infinity`/`NaN` and every progress tick was
  silently dropped. The player now falls back to the item's known Plex duration.

### Added
- **Offline resume sync-back.** Resume positions from offline (downloaded) playback are recorded
  on-device (`localViewOffset` + `pendingSync` in IndexedDB) and flushed to Plex on reconnect or
  next profile load, scoped to the active profile.

## [3.10.0] — 2026-07-08 — Offline downloads (Phases 1–3)

### Added
- **Download for offline playback.** Server endpoint `GET /api/items/:key/download.mp4` (Plex
  transcode → `ffmpeg -c copy` → seekable fragmented MP4; ffmpeg added to the Docker runner).
- Per-profile IndexedDB storage with a download queue, wake-lock during downloads, and
  memory-safe blob folding for 500 MB+ files.
- Downloads screen (⬇ nav button) and a ⬇ download badge on media cards.
- Local blob playback with a first-play seek fix for half-watched downloads.
- Service worker + cached profiles for an offline app-shell launch (partial — known gaps in the
  offline bootstrap).

## [3.9.1] — 2026-06-24
- Pin Wild Card to the bottom of the home rows.

## [3.9.0] — 2026-06-24
- Emoji-only Libraries button, reorderable home rows, year subtitle on shows.

## [3.8.0] — 2026-06-24
- Adaptive streaming quality (fix off-network buffering).

## [3.7.8] — 2026-06-17
- Restore year on movie cards.

## [3.7.7] — 2026-06-17
- Condense Recently Added to shows; rework home customization.

## [3.7.6] — 2026-06-17
- New PWA app icon.

## [3.7.5] — 2026-06-17
- Document the optional autoheal sidecar.

## [3.7.4] — 2026-06-17
- Clean public snapshot.
