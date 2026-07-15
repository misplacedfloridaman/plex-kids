# Changelog

All notable changes to Plex Kids are recorded here, newest first.
Dates are ISO (YYYY-MM-DD). Versions before 3.10.0 are backfilled from the git tag history.

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
