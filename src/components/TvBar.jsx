import { useEffect, useState } from "react";

// Slim bar pinned to the bottom while this device sends to the TV: the last send's result
// (or error) and what the TV is playing now, with play/pause. Polls the TV every 5 s while
// the page is visible.
export default function TvBar({ tvName, notice }) {
  const [tvState, setTvState] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/tv/state");
        if (alive) setTvState(r.ok ? await r.json() : null);
      } catch { if (alive) setTvState(null); }
    }
    poll();
    const timer = setInterval(poll, 5000);
    document.addEventListener("visibilitychange", poll);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [notice]);

  async function playPause() {
    setBusy(true);
    try {
      await fetch("/api/tv/playpause", { method: "POST" });
      setTvState((s) => s && { ...s, state: s.state === "playing" ? "paused" : "playing" });
    } finally { setBusy(false); }
  }

  const active = tvState && (tvState.state === "playing" || tvState.state === "paused") && tvState.title;
  if (!notice && !active) return null;

  return (
    <div style={{
      position: "fixed", left: "12px", right: "12px", bottom: "calc(12px + env(safe-area-inset-bottom))",
      zIndex: 50, background: "rgba(20,20,28,0.94)", color: "#fff", borderRadius: "18px",
      padding: "12px 16px", display: "flex", alignItems: "center", gap: "12px",
      boxShadow: "0 8px 28px rgba(0,0,0,0.5)", fontFamily: "sans-serif",
    }}>
      <span style={{ fontSize: "22px" }}>📺</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        {notice && (
          <span style={{ display: "block", fontSize: "13px", fontWeight: 700, color: notice.error ? "#f87171" : "#4ade80" }}>
            {notice.text}
          </span>
        )}
        {active && (
          <span style={{ display: "block", fontSize: "15px", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            On {tvName}: {tvState.title}
          </span>
        )}
      </span>
      {active && (
        <button onClick={playPause} disabled={busy} aria-label={tvState.state === "playing" ? "Pause TV" : "Play TV"}
          style={{ border: "none", borderRadius: "999px", width: "44px", height: "44px", fontSize: "18px", background: "rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer" }}>
          {tvState.state === "playing" ? "⏸" : "▶︎"}
        </button>
      )}
    </div>
  );
}
