import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

// mediaItems      — current list, used to find the next episode for autoplay
// onPlayNext      — called with the next item when autoplay countdown fires
// onProgressSaved — called after reporting progress so App can refresh Continue Watching
// Progress is reported to Plex (server-side, per active profile) — not localStorage.
export function usePlayer({ mediaItems, onPlayNext, onProgressSaved }) {
  const [playerUrl, setPlayerUrl] = useState(null);
  const [playerTitle, setPlayerTitle] = useState("");
  const [playerError, setPlayerError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayerControls, setShowPlayerControls] = useState(true);
  const [currentPlayingItem, setCurrentPlayingItem] = useState(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState(null);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPreviewTime, setScrubPreviewTime] = useState(0);

  const videoRef = useRef(null);
  const playerShellRef = useRef(null);
  const currentPlayingItemRef = useRef(null);
  const pendingResumeTimeRef = useRef(0);
  const autoplayTimeoutRef = useRef(null);
  const autoplayIntervalRef = useRef(null);
  const lastReportRef = useRef(0); // throttles progress reporting to Plex
  // Always-current refs for callbacks used inside timers/effects
  const onPlayNextRef = useRef(onPlayNext);
  const onProgressSavedRef = useRef(onProgressSaved);
  onPlayNextRef.current = onPlayNext;
  onProgressSavedRef.current = onProgressSaved;

  useEffect(() => {
    currentPlayingItemRef.current = currentPlayingItem;
  }, [currentPlayingItem]);


  useEffect(() => {
    if (!playerUrl || !videoRef.current) return;

    const video = videoRef.current;

    function handleEnded() { startNextEpisodeCountdown(); }
    function handlePlay() { setIsPlaying(true); }
    function handlePause() { persistCurrentProgress("paused", true); setIsPlaying(false); }
    function handleTimeUpdate() {
      if (!isScrubbing) setVideoCurrentTime(video.currentTime || 0);
      setVideoDuration(video.duration || 0);
      persistCurrentProgress();
    }
    function handleLoadedMetadata() {
      setVideoDuration(video.duration || 0);
      resumeIfPossible();
    }
    function resumeIfPossible() {
      const resumeTime = pendingResumeTimeRef.current;
      if (!resumeTime || resumeTime <= 5) return;
      if (!video.duration || Number.isNaN(video.duration)) return;
      if (resumeTime < video.duration - 10) video.currentTime = resumeTime;
      pendingResumeTimeRef.current = 0;
    }
    function handleWaiting() { setIsBuffering(true); }
    function handlePlaying() { setIsBuffering(false); }

    setIsBuffering(true);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("canplay", resumeIfPossible);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);

    setPlayerError(null);
    video.removeAttribute("src");
    video.load();

    function removeListeners() {
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("canplay", resumeIfPossible);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
    }

    if (playerUrl.endsWith(".mp4")) {
      video.src = playerUrl;
      video.play().catch(() => {});
      return removeListeners;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        fragLoadingMaxRetry: 10,
        fragLoadingRetryDelay: 500,
        fragLoadingMaxRetryTimeout: 8000,
      });
      hls.loadSource(playerUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        resumeIfPossible();
        video.play().catch(() => {});
      });
      let networkRecovered = false;
      let mediaRecovered = false;
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (!data.fatal) {
          console.warn("Non-fatal HLS warning", data);
          return;
        }
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !networkRecovered) {
          networkRecovered = true;
          console.warn("Fatal HLS network error — retrying", data.details);
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecovered) {
          mediaRecovered = true;
          console.warn("Fatal HLS media error — recovering", data.details);
          hls.recoverMediaError();
        } else {
          console.error("Fatal HLS error (unrecoverable)", data);
          setPlayerError(`${data.type}: ${data.details}`);
        }
      });
      return () => { removeListeners(); hls.destroy(); };
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playerUrl;
      video.play().catch(() => {});
    }

    return removeListeners;
  }, [playerUrl, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playerUrl || !isPlaying || !showPlayerControls) return;
    const id = window.setTimeout(() => setShowPlayerControls(false), 3000);
    return () => window.clearTimeout(id);
  }, [playerUrl, isPlaying, showPlayerControls]);

  // -------------------------------------------------------------------------

  // Reports playback position to Plex (which owns progress/Continue Watching now).
  // "playing" ticks are throttled to ~10s; pause/stop are forced and refresh the rail.
  function persistCurrentProgress(state = "playing", force = false) {
    const video = videoRef.current;
    const item = currentPlayingItemRef.current;
    if (!video || !item) return;
    const duration = video.duration;
    if (!duration || Number.isNaN(duration) || duration === Infinity) return;
    const now = Date.now();
    if (!force && now - lastReportRef.current < 10000) return;
    lastReportRef.current = now;
    const qs = new URLSearchParams({
      time: String(Math.floor((video.currentTime || 0) * 1000)),
      duration: String(Math.floor(duration * 1000)),
      state,
    });
    fetch(`/api/items/${item.key}/progress?${qs.toString()}`, { method: "POST", keepalive: true }).catch(() => {});
    if (force) onProgressSavedRef.current();
  }

  function clearAutoplayTimers() {
    if (autoplayTimeoutRef.current) {
      window.clearTimeout(autoplayTimeoutRef.current);
      autoplayTimeoutRef.current = null;
    }
    if (autoplayIntervalRef.current) {
      window.clearInterval(autoplayIntervalRef.current);
      autoplayIntervalRef.current = null;
    }
  }

  function cancelNextEpisodeCountdown() {
    clearAutoplayTimers();
    setNextEpisodeCountdown(null);
  }

  function startNextEpisodeCountdown() {
    const nextIndex = (currentPlayingIndex ?? -1) + 1;
    const nextItem = mediaItems[nextIndex];
    if (!nextItem) return;

    clearAutoplayTimers();
    setNextEpisodeCountdown(5);

    autoplayIntervalRef.current = window.setInterval(() => {
      setNextEpisodeCountdown((n) => (n === null ? null : n - 1));
    }, 1000);

    autoplayTimeoutRef.current = window.setTimeout(() => {
      clearAutoplayTimers();
      setNextEpisodeCountdown(null);
      persistCurrentProgress("stopped", true);
      onPlayNextRef.current(nextItem);
    }, 5000);
  }

  function skipToNext() {
    cancelNextEpisodeCountdown();
    persistCurrentProgress("stopped", true);
    const nextIndex = (currentPlayingIndex ?? -1) + 1;
    const nextItem = mediaItems[nextIndex];
    if (nextItem) onPlayNextRef.current(nextItem);
  }

  function startPlayback({ url, title, item, resumeTime, index }) {
    pendingResumeTimeRef.current = resumeTime || 0;
    setCurrentPlayingItem(item);
    setCurrentPlayingIndex(index ?? null);
    setShowPlayerControls(true);
    setPlayerTitle(title);
    setPlayerError(null);
    setPlayerUrl(url);
  }

  function clearPlayer() {
    setPlayerUrl(null);
    setPlayerTitle("");
    setPlayerError(null);
    setCurrentPlayingItem(null);
  }

  // Restores player display state when navigating back through the stack
  function restorePlayerState({ url, title }) {
    setPlayerUrl(url || null);
    setPlayerTitle(title || "");
    setPlayerError(null);
  }

  function closePlayer() {
    cancelNextEpisodeCountdown();
    persistCurrentProgress("stopped", true);
    const video = videoRef.current;
    if (video) video.pause();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setPlayerUrl(null);
    setPlayerTitle("");
    setPlayerError(null);
    setIsPlaying(false);
    setShowPlayerControls(true);
    setCurrentPlayingItem(null);
  }

  function togglePlayPause() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  function handleVideoTap(event) {
    event.stopPropagation();
    setShowPlayerControls(true);
    togglePlayPause();
  }

  function handleSeek(event) {
    event.stopPropagation();
    const newTime = Number(event.target.value);
    setScrubPreviewTime(newTime);
    setVideoCurrentTime(newTime);
    const video = videoRef.current;
    if (video && videoDuration) video.currentTime = newTime;
  }

  function handleSeekStart(event) {
    event.stopPropagation();
    setIsScrubbing(true);
    setScrubPreviewTime(videoRef.current?.currentTime || videoCurrentTime);
  }

  function handleSeekEnd(event) {
    event.stopPropagation();
    const video = videoRef.current;
    if (!video || !videoDuration) { setIsScrubbing(false); return; }
    const targetTime = Math.min(Math.max(Number(event.target.value), 0), videoDuration);
    video.currentTime = targetTime;
    setVideoCurrentTime(targetTime);
    setScrubPreviewTime(targetTime);
    setIsScrubbing(false);
  }

  function retryPlayback() {
    const currentTime = videoRef.current?.currentTime || 0;
    pendingResumeTimeRef.current = currentTime;
    setPlayerError(null);
    setRetryKey((k) => k + 1);
  }

  function revealPlayerControls() {
    setShowPlayerControls(true);
  }

  return {
    // Refs (passed directly to Player component)
    videoRef,
    playerShellRef,
    // Readable state
    playerUrl,
    playerTitle,
    playerError,
    isPlaying,
    isBuffering,
    showPlayerControls,
    nextEpisodeCountdown,
    displayTime: isScrubbing ? scrubPreviewTime : videoCurrentTime,
    videoDuration,
    currentPlayingItem,
    currentPlayingIndex,
    // Actions
    startPlayback,
    skipToNext,
    clearPlayer,
    restorePlayerState,
    persistCurrentProgress,
    cancelNextEpisodeCountdown,
    closePlayer,
    togglePlayPause,
    handleVideoTap,
    handleSeek,
    handleSeekStart,
    handleSeekEnd,
    revealPlayerControls,
    retryPlayback,
  };
}
