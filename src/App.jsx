import { useEffect, useRef, useState } from "react";

import {
  pageStyle,
  libraryTitleStyle,
  libraryHeaderStyle,
  railTitleStyle,
  gridSectionStyle,
  videoGridStyle,
  railStyle,
  backButtonStyle,
  searchWrapStyle,
  searchInputStyle,
} from "./styles";

import Player from "./components/Player";
import MediaCard from "./components/MediaCard";
import PlexKidsLogo from "./components/PlexKidsLogo";
import RecommendedFeed from "./components/RecommendedFeed";
import Rail from "./components/Rail";
import ProfilePicker from "./components/ProfilePicker";
import Settings from "./components/Settings";
import HomeLayoutPanel from "./components/HomeLayoutPanel";
import { usePlayer } from "./hooks/usePlayer";
import { cosmeticFor } from "./profiles";
import {
  loadFavorites,
  toggleFavoriteItem,
  getDeviceClientId,
} from "./storage";
import { resolveStreamParams } from "./quality";

const API_SERVER = "";

function App() {
  const [activeProfile, setActiveProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [homeLayout, setHomeLayout] = useState(null);
  const [showHomeLayout, setShowHomeLayout] = useState(false);

  const [selectedLibrary, setSelectedLibrary] = useState(null);
  const [navigationStack, setNavigationStack] = useState([]);
  const [libraries, setLibraries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mediaItems, setMediaItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [continueWatchingItems, setContinueWatchingItems] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const libraryOriginRef = useRef("home");

  const profileId = activeProfile?.uuid;

  // Continue Watching now comes from Plex's On Deck (per active profile), not localStorage.
  async function loadContinue() {
    try {
      const res = await fetch(`${API_SERVER}/api/continue`);
      const data = await res.json();
      setContinueWatchingItems(data.items || []);
    } catch { /* keep whatever's shown */ }
  }

  // Per-profile home layout (which rails show + Wild Card libraries).
  async function loadHomeLayout() {
    try {
      const data = await (await fetch(`${API_SERVER}/api/home/layout`)).json();
      setHomeLayout(data);
    } catch { setHomeLayout(null); }
  }

  const player = usePlayer({
    mediaItems,
    onPlayNext: (item) => playItem(item),
    onProgressSaved: () => loadContinue(),
  });

  // Reload profile-specific data whenever the active profile changes.
  // Continue Watching = Plex On Deck; favorites stay local (no Plex primitive fits).
  useEffect(() => {
    if (!profileId) return;
    loadContinue(); // eslint-disable-line react-hooks/set-state-in-effect
    loadHomeLayout();
    setFavorites(loadFavorites(profileId));
  }, [profileId]);

  // Visible profiles for the picker (Settings can hide some, so this is refetched after save).
  async function loadProfiles() {
    try {
      const res = await fetch(`${API_SERVER}/api/profiles`);
      const data = await res.json();
      setProfiles(data.profiles || []);
    } catch {
      setProfiles([]);
    }
  }

  // On load: restore this device's session (skip the picker if a profile is already
  // chosen) and fetch the Plex Home users that back the picker.
  useEffect(() => {
    (async () => {
      try {
        const sessionData = await (await fetch(`${API_SERVER}/api/session`)).json();
        if (sessionData.user) setActiveProfile(sessionData.user);
        await loadProfiles();
      } finally {
        setProfilesLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!profileId) return; // libraries are per-profile now (Plex scopes them by user)
    async function loadLibraries() {
      try {
        const response = await fetch(`${API_SERVER}/api/libraries`);
        if (!response.ok) throw new Error(`Plex responded with ${response.status}`);
        const data = await response.json();
        const libs = (data.libraries || []).map((section) => ({
          name: section.name,
          key: section.key,
          type: section.type,
          color: getLibraryColor(section.name),
          emoji: getLibraryEmoji(section.name),
          thumb: null,
        }));
        setLibraries(libs);
        setLoading(false);

        // Fetch a random thumbnail for each library in the background
        const thumbs = await Promise.all(
          libs.map((lib) =>
            fetch(`${API_SERVER}/api/libraries/${lib.key}/thumb`)
              .then((r) => r.json())
              .then((d) => ({ key: lib.key, thumb: d.thumb ?? null }))
              .catch(() => ({ key: lib.key, thumb: null }))
          )
        );
        setLibraries((prev) =>
          prev.map((lib) => ({
            ...lib,
            thumb: thumbs.find((t) => t.key === lib.key)?.thumb ?? null,
          }))
        );
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    }
    loadLibraries();
  }, [profileId]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]); // eslint-disable-line react-hooks/set-state-in-effect
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_SERVER}/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = await res.json();
        setSearchResults(data.items || []);
      } catch (err) {
        if (err.name !== "AbortError") setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [searchQuery]);

  async function selectProfile(profile) {
    setSwitching(true);
    try {
      const res = await fetch(`${API_SERVER}/api/session/switch/${profile.uuid}`, { method: "POST" });
      if (!res.ok) throw new Error("switch failed");
      const data = await res.json();
      setActiveProfile(data.user);
    } catch {
      setError("Couldn't switch profile — try again.");
    } finally {
      setSwitching(false);
    }
  }

  async function switchProfile() {
    player.closePlayer();
    setSelectedLibrary(null);
    setShowLibraryPicker(false);
    setShowSearch(false);
    setSearchQuery("");
    setNavigationStack([]);
    setActiveProfile(null);
    try { await fetch(`${API_SERVER}/api/session/logout`, { method: "POST" }); } catch { /* ignore */ }
  }

  function openSearch() {
    setShowSearch(true);
  }

  function closeSearch() {
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
    player.videoRef.current?.focus();
  }

  async function openLibrary(library) {
    setSelectedLibrary(library);
    setNavigationStack([]);
    player.clearPlayer();
    setMediaItems([]);
    setItemsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_SERVER}/api/libraries/${library.key}/items`);
      if (!response.ok) throw new Error(`Plex responded with ${response.status}`);
      const data = await response.json();
      setMediaItems(data.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setItemsLoading(false);
    }
  }

  async function playItem(item, contextItems) {
    setError(null);
    player.cancelNextEpisodeCountdown();

    // If the caller provides a list (e.g. RecommendedFeed), sync it into mediaItems
    // so the player can find the next episode when autoplay fires.
    const itemList = contextItems?.length > 0 ? contextItems : mediaItems;
    if (contextItems?.length > 0) setMediaItems(contextItems);

    const itemIndex = itemList.findIndex((m) => m.key === item.key);

    if (isPlayablePlexItem(item)) {
      const clientId = getDeviceClientId(profileId);
      // Per-device streaming quality → Plex bitrate cap. Empty/0 = original (no cap, full
      // direct-stream — fine on the LAN, the buffering culprit off-network). "Auto" measures.
      const quality = await resolveStreamParams();
      const params = new URLSearchParams({ clientId });
      if (quality.maxVideoBitrate > 0) {
        params.set("maxVideoBitrate", String(quality.maxVideoBitrate));
        if (quality.videoResolution) params.set("videoResolution", quality.videoResolution);
      }
      // Resume from Plex's per-user viewOffset (ms) carried on the item.
      player.startPlayback({
        url: `${API_SERVER}/api/items/${item.key}/stream.m3u8?${params.toString()}`,
        title: item.title,
        item,
        resumeTime: item.viewOffset ? item.viewOffset / 1000 : 0,
        index: itemIndex >= 0 ? itemIndex : null,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    try {
      setItemsLoading(true);
      const response = await fetch(`${API_SERVER}/api/items/${item.key}/children`);
      if (!response.ok) throw new Error(`Plex responded with ${response.status}`);
      const data = await response.json();
      const items = data.items || [];
      if (items.length === 0) { alert(`No playable items found for ${item.title}`); return; }

      setNavigationStack((stack) => [
        ...stack,
        { selectedLibrary, mediaItems, playerUrl: player.playerUrl, playerTitle: player.playerTitle },
      ]);
      setSelectedLibrary({ name: item.title, key: item.key, type: item.type });
      setMediaItems(items);
      player.clearPlayer();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err.message);
    } finally {
      setItemsLoading(false);
    }
  }

  function goBack() {
    player.persistCurrentProgress();
    player.clearPlayer();

    if (navigationStack.length > 0) {
      const prev = navigationStack[navigationStack.length - 1];
      setSelectedLibrary(prev.selectedLibrary);
      setMediaItems(prev.mediaItems);
      player.restorePlayerState({ url: prev.playerUrl, title: prev.playerTitle });
      setNavigationStack((stack) => stack.slice(0, -1));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (libraryOriginRef.current === "picker") {
      libraryOriginRef.current = "home";
      setSelectedLibrary(null);
      setMediaItems([]);
      setShowLibraryPicker(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setSelectedLibrary(null);
    setMediaItems([]);
  }

  // Jump straight to the home screen from anywhere (search, seasons, deep library nav)
  // instead of backing out one level at a time. Keeps the active profile.
  function goHome() {
    player.persistCurrentProgress("stopped", true);
    player.clearPlayer();
    setSelectedLibrary(null);
    setMediaItems([]);
    setNavigationStack([]);
    setShowLibraryPicker(false);
    setShowSearch(false);
    setSearchQuery("");
    libraryOriginRef.current = "home";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleFavorite(item) {
    setFavorites(toggleFavoriteItem(profileId, item));
  }

  async function removeContinueWatching(item) {
    // Optimistic: drop it locally, then unscrobble in Plex and refresh from On Deck.
    setContinueWatchingItems((items) => items.filter((i) => i.key !== item.key));
    try {
      await fetch(`${API_SERVER}/api/items/${item.key}/unscrobble`, { method: "POST" });
    } catch { /* ignore */ }
    loadContinue();
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!activeProfile) {
    if (showSettings) {
      return (
        <Settings onClose={() => {
          setShowSettings(false);
          // Always refresh: covers hidden-profile changes AND the cold-start case where
          // signing in as admin just bootstrapped the token (picker was empty before).
          loadProfiles();
        }} />
      );
    }
    return (
      <ProfilePicker
        profiles={profiles}
        onSelect={selectProfile}
        loading={profilesLoading}
        disabled={switching}
        onOpenSettings={() => setShowSettings(true)}
      />
    );
  }

  if (loading) return <div style={pageStyle}>Loading Plex libraries...</div>;
  if (error) return <div style={pageStyle}>Error loading Plex: {error}</div>;

  if (showHomeLayout && homeLayout) {
    return (
      <HomeLayoutPanel
        layout={homeLayout}
        libraries={libraries}
        onClose={(saved) => { setShowHomeLayout(false); if (saved) loadHomeLayout(); }}
      />
    );
  }

  // Build once per render instead of scanning the favorites array per MediaCard.
  const favoriteKeys = new Set(favorites.map((f) => f.key));
  // Which home rails to show (defaults to all on until the layout loads).
  const homeSections = homeLayout?.sections ?? {
    favorites: true, continueWatching: true, nextUp: true,
    recentlyAdded: true, watchAgain: true, shortPicks: true, wildCard: true,
  };
  // Which libraries get their own row: null/undefined = all accessible libraries; else the list.
  const libraryRows = homeLayout?.libraryRows;
  const showLibraryRow = (name) => libraryRows == null || libraryRows.includes(name);
  // Top-to-bottom order of the home rows (per profile); default until the layout loads.
  const sectionOrder = homeLayout?.sectionOrder ?? [
    "favorites", "continueWatching", "nextUp", "recentlyAdded",
    "watchAgain", "libraries", "shortPicks", "wildCard",
  ];
  // Each token → its row (or false/[] when off/empty). Rendered in sectionOrder below.
  const homeSectionEls = {
    favorites: () => homeSections.favorites && favorites.length > 0 && (
      <section key="favorites" style={gridSectionStyle}>
        <h2 style={railTitleStyle}>Favorites</h2>
        <div style={railStyle}>
          {favorites.map((item) => (
            <MediaCard key={item.key} item={item} onPlay={playItem} apiServer={API_SERVER} horizontal isFavorite={true} onToggleFavorite={toggleFavorite} />
          ))}
        </div>
      </section>
    ),
    continueWatching: () => homeSections.continueWatching && continueWatchingItems.length > 0 && (
      <section key="continueWatching" style={gridSectionStyle}>
        <h2 style={railTitleStyle}>Continue Watching</h2>
        <div style={railStyle}>
          {continueWatchingItems.map((item) => (
            <MediaCard key={item.key} item={item} onPlay={playItem} apiServer={API_SERVER} horizontal subtitle={`${Math.round(item.progress * 100)}% watched`} isFavorite={favoriteKeys.has(item.key)} onToggleFavorite={toggleFavorite} onRemove={removeContinueWatching} />
          ))}
        </div>
      </section>
    ),
    nextUp: () => homeSections.nextUp && (
      <Rail key="nextUp" title="Next Up" url="/api/nextup" onPlay={playItem} apiServer={API_SERVER} favoriteKeys={favoriteKeys} onToggleFavorite={toggleFavorite} />
    ),
    recentlyAdded: () => homeSections.recentlyAdded && (
      <Rail key="recentlyAdded" title="Recently Added" url="/api/recently-added" onPlay={playItem} apiServer={API_SERVER} favoriteKeys={favoriteKeys} onToggleFavorite={toggleFavorite} />
    ),
    watchAgain: () => homeSections.watchAgain && (
      <Rail key="watchAgain" title="Watch Again" url="/api/watch-again" onPlay={playItem} apiServer={API_SERVER} favoriteKeys={favoriteKeys} onToggleFavorite={toggleFavorite} />
    ),
    libraries: () => libraries.filter((lib) => showLibraryRow(lib.name)).map((lib) => (
      <Rail key={lib.key} title={lib.name} url={`/api/library-rail?library=${encodeURIComponent(lib.name)}`} onPlay={playItem} apiServer={API_SERVER} favoriteKeys={favoriteKeys} onToggleFavorite={toggleFavorite} />
    )),
    shortPicks: () => homeSections.shortPicks && (
      <Rail key="shortPicks" title="Short Picks" url="/api/short-picks" onPlay={playItem} apiServer={API_SERVER} favoriteKeys={favoriteKeys} onToggleFavorite={toggleFavorite} />
    ),
    wildCard: () => homeSections.wildCard && (
      <section key="wildCard" style={gridSectionStyle}>
        <h2 style={railTitleStyle}>Wild Card</h2>
        <RecommendedFeed onPlay={playItem} favorites={favorites} onToggleFavorite={toggleFavorite} apiServer={API_SERVER} />
      </section>
    ),
  };

  const playerProps = {
    playerShellRef: player.playerShellRef,
    videoRef: player.videoRef,
    playerUrl: player.playerUrl,
    playerTitle: player.playerTitle,
    playerError: player.playerError,
    isPlaying: player.isPlaying,
    isBuffering: player.isBuffering,
    showPlayerControls: player.showPlayerControls,
    revealPlayerControls: player.revealPlayerControls,
    handleVideoTap: player.handleVideoTap,
    togglePlayPause: player.togglePlayPause,
    playNextItem: player.skipToNext,
    closePlayer: player.closePlayer,
    videoCurrentTime: player.displayTime,
    videoDuration: player.videoDuration,
    handleSeek: player.handleSeek,
    handleSeekStart: player.handleSeekStart,
    handleSeekEnd: player.handleSeekEnd,
    nextEpisodeCountdown: player.nextEpisodeCountdown,
    cancelNextEpisodeCountdown: player.cancelNextEpisodeCountdown,
    currentPlayingItem: player.currentPlayingItem,
    retryPlayback: player.retryPlayback,
  };

  const activeCosmetic = cosmeticFor(activeProfile.title);
  const profileAvatarStyle = {
    border: "none",
    borderRadius: "50%",
    width: "52px",
    height: "52px",
    fontSize: "26px",
    cursor: "pointer",
    backgroundColor: activeCosmetic.color,
    boxShadow: `0 4px 14px ${activeCosmetic.color}88`,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
    overflow: "hidden",
  };

  if (selectedLibrary) {
    return (
      <div style={pageStyle}>
        <div style={libraryHeaderStyle}>
          <button style={backButtonStyle} onClick={goBack}>←</button>
          <button style={backButtonStyle} onClick={goHome} title="Home" aria-label="Home">🏠</button>
          <h1 style={libraryTitleStyle}>{selectedLibrary.name}</h1>
        </div>

        {player.playerUrl && <Player {...playerProps} />}

        {itemsLoading && <p style={{ fontSize: "24px" }}>Loading items...</p>}
        {!itemsLoading && mediaItems.length === 0 && (
          <p style={{ fontSize: "24px" }}>No items found in this library.</p>
        )}
        {!itemsLoading && mediaItems.length > 0 && (
          <section style={{ marginTop: "10px" }}>
            <h2 style={railTitleStyle}>All Videos</h2>
            <div style={videoGridStyle}>
              {mediaItems.map((item) => (
                <MediaCard
                  key={item.key}
                  item={item}
                  onPlay={playItem}
                  apiServer={API_SERVER}
                  isFavorite={favoriteKeys.has(item.key)}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  if (showLibraryPicker) {
    return (
      <div style={pageStyle}>
        <div style={libraryHeaderStyle}>
          <button style={backButtonStyle} onClick={() => setShowLibraryPicker(false)}>←</button>
          <h1 style={libraryTitleStyle}>Libraries</h1>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", justifyContent: "center", paddingTop: "16px" }}>
          {libraries.map((library) => (
            <button
              key={library.name}
              style={{
                border: "none",
                borderRadius: "16px",
                padding: 0,
                cursor: "pointer",
                width: "260px",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                boxShadow: "0 6px 24px rgba(0,0,0,0.28)",
                background: "white",
                textAlign: "left",
              }}
              onClick={() => {
                libraryOriginRef.current = "picker";
                setShowLibraryPicker(false);
                openLibrary(library);
              }}
            >
              <div style={{
                width: "100%",
                height: "160px",
                backgroundColor: library.color,
                overflow: "hidden",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                {library.thumb ? (
                  <img
                    src={`${API_SERVER}/api/image?path=${encodeURIComponent(library.thumb)}`}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <span style={{ fontSize: "64px" }}>{library.emoji}</span>
                )}
              </div>
              <div style={{
                padding: "14px 16px",
                fontSize: "20px",
                fontWeight: "900",
                color: "#111827",
                fontFamily: "sans-serif",
              }}>
                {getLibraryDisplayName(library.name)}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <PlexKidsLogo />
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button style={profileAvatarStyle} onClick={switchProfile} title={`Switch profile (${activeProfile.title})`}>
            {activeProfile.thumb
              ? <img src={activeProfile.thumb} alt={activeProfile.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : activeCosmetic.emoji}
          </button>
          <button style={{ ...profileAvatarStyle, backgroundColor: "rgba(255,255,255,0.15)", boxShadow: "none" }} onClick={openSearch} title="Search">
            🔍
          </button>
          <button style={{ ...profileAvatarStyle, backgroundColor: "rgba(255,255,255,0.15)", boxShadow: "none" }} onClick={() => setShowHomeLayout(true)} title="Customize home">
            ✨
          </button>
          <button style={{ ...profileAvatarStyle, backgroundColor: "rgba(255,255,255,0.15)", boxShadow: "none" }} onClick={() => setShowLibraryPicker(true)} title="Libraries" aria-label="Libraries">
            📚
          </button>
        </div>
      </div>

      {showSearch && (
        <div style={searchWrapStyle}>
          <span style={{ fontSize: "22px" }}>🔍</span>
          <input
            style={searchInputStyle}
            type="search"
            placeholder="Search movies and shows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          <button
            onClick={closeSearch}
            style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "rgba(255,255,255,0.6)", padding: "0 4px" }}
          >
            ✕
          </button>
        </div>
      )}

      {player.playerUrl && <Player {...playerProps} />}

      {searchQuery ? (
        <section style={gridSectionStyle}>
          {isSearching && (
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "20px" }}>Searching...</p>
          )}
          {!isSearching && searchResults.length === 0 && (
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "20px" }}>
              No results for &ldquo;{searchQuery}&rdquo;
            </p>
          )}
          {searchResults.length > 0 && (
            <div style={videoGridStyle}>
              {searchResults.map((item) => (
                <MediaCard
                  key={item.key}
                  item={item}
                  onPlay={playItem}
                  apiServer={API_SERVER}
                  isFavorite={favoriteKeys.has(item.key)}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {[...sectionOrder.filter((t) => t !== "wildCard"), "wildCard"].map((token) => homeSectionEls[token]?.() || null)}
        </>
      )}
    </div>
  );
}

function getLibraryEmoji(name) {
  if (name === "Family Movies") return "🎬";
  if (name === "Kids Shows") return "📺";
  if (name === "YouTube") return "▶️";
  return "🎞️";
}

function getLibraryColor(name) {
  if (name === "Family Movies") return "#f59e0b";
  if (name === "Kids Shows") return "#3b82f6";
  if (name === "YouTube") return "#ef4444";
  return "#6b7280";
}

function getLibraryDisplayName(name) {
  if (name === "Family Movies") return "Movies";
  if (name === "Kids Shows") return "TV";
  return name;
}

function isPlayablePlexItem(item) {
  return Boolean(
    item.mediaKey || item.type === "movie" || item.type === "episode" ||
    item.type === "clip" || item.type === "track"
  );
}

export default App;
