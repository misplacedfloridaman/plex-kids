import { useEffect, useState } from "react";

function formatBytes(bytes) {
  if (!bytes) return null;
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
}

// Overlay showing media/transcode details for the currently playing item.
// Fetches Plex item details + the active session in parallel when opened.
export default function StreamInfoPanel({ itemKey, onClose }) {
  const [details, setDetails] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/items/${itemKey}/details`).then((r) => r.json()),
      fetch("/api/sessions").then((r) => r.json()),
    ]).then(([d, s]) => {
      setDetails(d);
      setSession(s.sessions?.find((x) => String(x.ratingKey) === String(itemKey)) ?? null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [itemKey]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        padding: "28px 32px",
        overflowY: "auto",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase" }}>Stream Info</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: "20px", cursor: "pointer", padding: "4px 8px" }}>✕</button>
      </div>

      {loading && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "14px" }}>Loading…</span>}

      {!loading && details && (
        <table style={{ borderCollapse: "collapse", fontSize: "13px", fontFamily: "monospace", color: "rgba(255,255,255,0.75)" }}>
          <tbody>
            {[
              ["File", details.file],
              ["Size", formatBytes(details.size)],
              ["Container", details.container],
              ["Video", details.videoCodec ? `${details.videoCodec} ${details.width}×${details.height} (${details.videoResolution}p)` : null],
              ["Audio", details.audioCodec],
              ["Bitrate", details.bitrate ? `${details.bitrate} kbps` : null],
              ["—", null],
              ["Transcode video", session?.transcode?.videoDecision ?? "no active session"],
              ["Transcode audio", session?.transcode?.audioDecision ?? null],
              ["Speed", session?.transcode?.speed != null ? `${session.transcode.speed}×` : null],
              ["Throttled", session?.transcode?.throttled != null ? String(session.transcode.throttled) : null],
              ["Progress", session?.transcode?.progress != null ? `${Math.round(session.transcode.progress)}%` : null],
              ["Output", session?.transcode?.width ? `${session.transcode.width}×${session.transcode.height}` : null],
              ["Player state", session?.playerState ?? null],
              ["Device", session?.playerDevice ?? null],
              ["User", session?.user ?? null],
            ].filter(([, v]) => v != null).map(([label, value]) => (
              <tr key={label}>
                <td style={{ color: "rgba(255,255,255,0.35)", paddingRight: "20px", paddingBottom: "6px", whiteSpace: "nowrap", verticalAlign: "top" }}>{label === "—" ? "" : label}</td>
                <td style={{ paddingBottom: "6px", wordBreak: "break-all" }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
