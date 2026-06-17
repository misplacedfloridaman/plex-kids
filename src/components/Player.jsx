import { useState } from "react";
import StreamInfoPanel from "./StreamInfoPanel";
import {
  closePlayerButtonStyle,
  fullscreenPlayerWrapStyle,
  fullscreenVideoPlayerStyle,
  playerButtonGroupStyle,
  playerErrorStyle,
  playerLeftControlsStyle,
  playerOverlayStyle,
  playerTitleStyle,
  primaryPlayerControlButtonStyle,
  playerControlButtonStyle,
} from "../styles";

export default function Player({
  playerShellRef,
  videoRef,
  playerUrl,
  playerTitle,
  playerError,
  isPlaying,
  isBuffering,
  showPlayerControls,
  revealPlayerControls,
  handleVideoTap,
  togglePlayPause,
  playNextItem,
  closePlayer,
  nextEpisodeCountdown,
  cancelNextEpisodeCountdown,
  videoCurrentTime,
  videoDuration,
  handleSeek,
  handleSeekStart,
  handleSeekEnd,
  currentPlayingItem,
  retryPlayback,
}) {
  const [showInfo, setShowInfo] = useState(false);

  if (!playerUrl) return null;

  return (
    <div
      style={fullscreenPlayerWrapStyle}
      ref={playerShellRef}
      onMouseMove={revealPlayerControls}
      onClick={handleVideoTap}
    >
      <video
        ref={videoRef}
        style={fullscreenVideoPlayerStyle}
        playsInline
        preload="auto"
      />

      <div
        style={{
          ...playerOverlayStyle,
          opacity: showPlayerControls ? 1 : 0,
          pointerEvents: showPlayerControls ? "auto" : "none",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={playerLeftControlsStyle}>
          <button
            style={primaryPlayerControlButtonStyle}
            onClick={togglePlayPause}
            aria-label={isPlaying ? "Pause" : "Play"}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
        </div>

        <h2 style={playerTitleStyle}>{playerTitle}</h2>

        <div style={playerButtonGroupStyle}>
          <button
            style={playerControlButtonStyle}
            onClick={playNextItem}
            aria-label="Next"
            title="Next"
          >
            ⏭
          </button>
          <button
            style={closePlayerButtonStyle}
            onClick={closePlayer}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        {videoDuration > 0 && (
          <input
            type="range"
            min="0"
            max={videoDuration}
            value={videoCurrentTime}
            step="1"
            onChange={handleSeek}
            onPointerDown={handleSeekStart}
            onPointerUp={handleSeekEnd}
            onTouchStart={handleSeekStart}
            onTouchEnd={handleSeekEnd}
            aria-label="Scrub video"
            style={{
              width: "100%",
              flexBasis: "100%",
              accentColor: "#22c55e",
            }}
          />
        )}
      </div>

      {currentPlayingItem && showPlayerControls && (
        <button
          onClick={(e) => { e.stopPropagation(); setShowInfo(true); }}
          style={{
            position: "absolute",
            // Offset by the iOS safe-area inset so it clears the status bar/battery icon.
            top: "calc(env(safe-area-inset-top, 0px) + 16px)",
            right: "calc(env(safe-area-inset-right, 0px) + 14px)",
            width: "22px",
            height: "22px",
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.25)",
            background: "transparent",
            color: "rgba(255,255,255,0.3)",
            fontSize: "11px",
            fontStyle: "italic",
            fontWeight: "bold",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 5,
          }}
          title="Stream info"
        >
          i
        </button>
      )}

      {showInfo && currentPlayingItem && (
        <StreamInfoPanel itemKey={currentPlayingItem.key} onClose={() => setShowInfo(false)} />
      )}

      {isBuffering && !playerError && (
        <div style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10,
          pointerEvents: "none",
        }}>
          <div className="player-spinner" />
        </div>
      )}

      {nextEpisodeCountdown !== null && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.72)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "18px",
            zIndex: 20,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div
            style={{
              color: "white",
              fontSize: "42px",
              fontWeight: "900",
              textAlign: "center",
              textShadow: "0 4px 18px rgba(0,0,0,0.45)",
            }}
          >
            Next episode in {nextEpisodeCountdown}
          </div>

          <div style={{ display: "flex", gap: "16px" }}>
            <button style={primaryPlayerControlButtonStyle} onClick={playNextItem}>
              ▶
            </button>

            <button
              style={closePlayerButtonStyle}
              onClick={cancelNextEpisodeCountdown}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {playerError && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px", background: "rgba(0,0,0,0.7)" }} onClick={(e) => e.stopPropagation()}>
          <p style={playerErrorStyle}>Something went wrong</p>
          <button
            onClick={retryPlayback}
            style={{ background: "rgba(255,255,255,0.15)", border: "2px solid rgba(255,255,255,0.4)", borderRadius: "12px", color: "#fff", fontSize: "18px", fontWeight: "700", padding: "14px 36px", cursor: "pointer" }}
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
