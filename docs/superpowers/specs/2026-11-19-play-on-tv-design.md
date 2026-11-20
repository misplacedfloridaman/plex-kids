# Play on TV — design

Status: draft for owner review · 2026-11-19

## Intent

A parent lying in bed, phone in hand, gets asked by a kid to "put on" a specific episode. Today
that means getting up, because Plex's own apps dropped remote control. Plex Kids already has
everything needed to *find* the episode (per-kid profiles, Continue Watching, show → season →
episode browsing, search, phone-sized layout). This feature adds the last step: send the chosen
movie or episode to a TV instead of playing it on the phone.

Success: from bed, open Plex Kids on the phone, pick the kid's profile, tap the episode, and it
starts on the TV within a few seconds, at that kid's resume point, with no TV remote involved.

## Goals

- From a device the parent has enabled, tapping a playable item (movie, episode, clip) starts it
  on a configured TV instead of on the device.
- Exact episode selection is first-class: any episode reachable in the app can be sent.
- Resume from the **browsing profile's** Plex resume point.
- Wake the TV if it is asleep.
- Clear confirmation on the phone that it worked (or why it didn't).
- Minimal on-phone control of what's playing on the TV: play/pause.

## Non-goals

- A full TV remote (d-pad, volume, seeking, subtitles).
- Multiple TVs. One target, configured by env vars. (Design shouldn't make a second target
  hard later, but don't build a picker.)
- Changing how kids' own devices behave. Kids' iPads keep playing on-device.
- Any cloud relay. Everything is LAN (or the user's private Tailscale).

## Anti-goals (would make this a failure even if it technically works)

- Kids' devices able to commandeer the living-room TV.
- Owner-specific details (IPs, entity names, tokens, kids' names) in the public repo.
- The feature changing anything for an install that hasn't configured it.
- Leaking the Home Assistant token to the browser.

## How it works (decided)

```
Phone (Plex Kids, TV mode on)
  -> POST /api/items/:key/play-on-tv          (Plex Kids server, existing session)
  -> Home Assistant REST API
       media_player.turn_on      (if the TV entity is off; wait until it isn't, ~10 s cap)
       media_player.play_media   media_content_type: url
                                 media_content_id: <deep link built from the template>
  -> Apple TV (HA apple_tv integration, Companion protocol) opens the deep link
  -> Rivulet (tvOS Plex client) plays ratingKey at offset
```

This path is already proven on the owner's setup (an iOS Shortcut → script → HA → Rivulet
deep link works end to end from a sleeping Apple TV). Plex Kids just becomes another caller.

### Server (server.js)

- New optional env config, documented in `docker-compose.example.yml` and README:
  - `TV_HA_URL` — Home Assistant base URL reachable from the container.
  - `TV_HA_TOKEN` — HA long-lived access token (recommend a dedicated non-admin HA user).
  - `TV_HA_ENTITY` — the `media_player.*` entity of the TV device.
  - `TV_NAME` — display name, default `"TV"`.
  - `TV_URL_TEMPLATE` — deep link template, default
    `rivulet://play?ratingKey={ratingKey}&offset={offsetMs}`. Placeholders: `{ratingKey}`,
    `{offsetMs}` (integer ms, 0 when none). If `{offsetMs}` is 0 the `&offset=0` may be sent
    as-is; Rivulet treats 0 as "from the start", which is correct for an unstarted item.
  - Feature is **enabled only when URL, token and entity are all set**. Otherwise every new
    route returns 404 and the client shows nothing new.
- `GET /api/config` additionally returns `tv: { enabled, name }` (never the token or URL).
- `POST /api/items/:key/play-on-tv`
  - Requires an active profile session (`req.session.user`); 400 otherwise.
  - Validates `:key` is digits only (ratingKeys are numeric) before building any URL.
  - Reads the item's per-user `viewOffset` with the session's profile token
    (`/library/metadata/:key`, as `/api/items/:key/details` does) and fills the template.
  - Wakes the TV if its HA state is `off`/`standby`: call `turn_on`, poll state up to ~10 s.
  - Calls `play_media`. On a connection error, retry once.
  - Responds `{ ok: true, title }` or `{ error }` with a human-readable message
    ("Couldn't reach Home Assistant", "TV didn't wake up").
- `GET /api/tv/state` → `{ state, title, app }` from the HA entity (for the now-playing bar).
- `POST /api/tv/playpause` → `media_player.media_play_pause`.
- All HA calls server-side only; token never leaves the server.

### Client

- **Per-device "Play on" setting** in Settings (which is already PIN-guarded), next to the
  existing per-device Streaming quality: `This device` (default) or `<TV_NAME>`. Stored in
  localStorage like streaming quality. Shown only when `tv.enabled`.
  - This is what keeps kids' devices from sending to the TV: only a device where a parent has
    unlocked Settings and chosen the TV can do it.
- When the device's target is the TV:
  - A small pill on the home header shows `📺 <TV_NAME>` so it's obvious where taps go.
    Tapping the pill toggles this device between TV and on-device for quick switching
    (only exists on devices a parent already enabled).
  - `playItem` for a playable item calls `play-on-tv` instead of starting the on-device
    player. Non-playable items (shows, seasons) still drill in exactly as today.
  - Success: a toast/bar "Playing on <TV_NAME>: <title>". Failure: the server's message.
  - A slim now-playing bar (polls `/api/tv/state` while visible, e.g. every 5 s, stops when
    hidden) shows the TV's current title and a play/pause button.
- Downloads screen: items with a local download still go to the TV when TV mode is on (the TV
  plays from Plex, not from the phone's download).

## Constraints

- Public, open-source repo: generic names and placeholders only, in code, docs, examples and
  commit messages. Owner values live only in the gitignored `docker-compose.yml`.
- Follow existing conventions: Express 5 ES modules, inline style objects, `fetchPlexJson`,
  `activeToken(req)`, per-device prefs in localStorage alongside `quality.js`.
- No new runtime dependencies (native `fetch` is enough for HA).
- Version bump per repo convention (`PlexKidsLogo.jsx`, CLAUDE.md table, CHANGELOG.md) —
  next minor: v3.12.0.
- The owner's deployment builds from source via `/opt/stack/docker-compose.yaml`
  (`build: .../plex-kids-docker`); deploying = rebuild + restart that one container.

## Known trade-off (accepted)

Rivulet on the TV plays as whichever Rivulet profile is active there, so progress *during* TV
playback is recorded to that Plex user, not necessarily the kid picked in Plex Kids. The
browsing profile still decides **where playback starts** (via `offset`). Acceptable for now.

## Builder's calls

- Exact UI styling of the pill, toast and now-playing bar (match existing look).
- Polling interval and wake timeout values within the ranges above.
- Whether the play-on-tv response waits for the TV state to flip to playing (nice to have).
- How to structure the HA helper in server.js.

## Owner setup (outside the repo)

- Create a dedicated non-admin HA user and long-lived token; put it and the entity/URL in the
  gitignored compose file.
- Rivulet: Settings → Profile Picker → Off (otherwise deep links wait at "Who's watching").
