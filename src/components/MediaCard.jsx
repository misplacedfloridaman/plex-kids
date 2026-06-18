import { useState } from "react";
import { videoCardStyle, itemInfoStyle, itemTitleStyle, itemMetaStyle, railCardStyle } from "../styles";

const cardWrapStyle = {
  position: "relative",
};

const starButtonStyle = {
  position: "absolute",
  top: "10px",
  right: "10px",
  background: "rgba(0,0,0,0.55)",
  border: "none",
  borderRadius: "50%",
  width: "42px",
  height: "42px",
  fontSize: "22px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2,
  lineHeight: 1,
};

const removeButtonStyle = {
  position: "absolute",
  top: "10px",
  left: "10px",
  background: "rgba(0,0,0,0.55)",
  border: "none",
  borderRadius: "50%",
  width: "42px",
  height: "42px",
  fontSize: "18px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2,
  color: "white",
  lineHeight: 1,
};

export default function MediaCard({ item, onPlay, apiServer = "", subtitle, isFavorite, onToggleFavorite, onRemove, horizontal }) {
  const [confirming, setConfirming] = useState(false);
  // Show name for episodes; explicit subtitle if passed. Movies fall back to their year
  // (they have no show name, and the line otherwise sits empty — too much negative space).
  const displaySubtitle = subtitle ?? item.grandparentTitle ?? (item.type === "movie" ? item.year : null) ?? null;
  const progress = item.progress != null ? Math.min(Math.max(item.progress, 0), 1) : null;

  return (
    <div style={horizontal ? { ...cardWrapStyle, ...railCardStyle } : cardWrapStyle}>
      <button style={{ ...videoCardStyle, width: "100%" }} onClick={() => onPlay(item)}>
        {item.thumb && (
          <div style={{
            position: "relative",
            width: "100%",
            aspectRatio: "16 / 9",
            borderRadius: "10px",
            marginBottom: "8px",
            backgroundColor: "white",
            overflow: "hidden",
            flexShrink: 0,
          }}>
            <img
              src={`${apiServer}/api/image?path=${encodeURIComponent(item.thumb)}`}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />
            {progress !== null && (
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 6px 6px" }}>
                <div style={{ height: "5px", borderRadius: "3px", backgroundColor: "rgba(0,0,0,0.35)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${progress * 100}%`, backgroundColor: "#e5a00d", borderRadius: "3px" }} />
                </div>
              </div>
            )}
          </div>
        )}
        <div style={itemInfoStyle}>
          <div style={itemTitleStyle}>{item.title}</div>
          <div style={itemMetaStyle}>{displaySubtitle || " "}</div>
        </div>
      </button>

      {onToggleFavorite && (
        <button
          style={starButtonStyle}
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(item); }}
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          {isFavorite ? "⭐" : "☆"}
        </button>
      )}

      {onRemove && (
        <button
          style={removeButtonStyle}
          onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
          aria-label="Remove from Continue Watching"
        >
          ✕
        </button>
      )}

      {confirming && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.84)",
            borderRadius: "16px",
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            padding: "16px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <p style={{ color: "white", fontSize: "15px", fontWeight: "700", textAlign: "center", margin: 0, lineHeight: 1.4 }}>
            Remove from<br />Continue Watching?
          </p>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => { setConfirming(false); onRemove(item); }}
              style={{ border: "none", borderRadius: "999px", padding: "10px 20px", background: "#ef4444", color: "white", fontSize: "15px", fontWeight: "800", cursor: "pointer" }}
            >
              Yes
            </button>
            <button
              onClick={() => setConfirming(false)}
              style={{ border: "none", borderRadius: "999px", padding: "10px 20px", background: "rgba(255,255,255,0.18)", color: "white", fontSize: "15px", fontWeight: "800", cursor: "pointer" }}
            >
              No
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
