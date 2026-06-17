import { cosmeticFor } from "../profiles";
import PlexKidsLogo from "./PlexKidsLogo";

export default function ProfilePicker({ profiles, onSelect, loading, disabled, onOpenSettings }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#000",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px",
      fontFamily: "sans-serif",
      boxSizing: "border-box",
      position: "relative",
    }}>
      <div style={{ marginBottom: "40px" }}>
        <PlexKidsLogo />
      </div>

      <h2 style={{
        color: "white",
        fontSize: "36px",
        fontWeight: "900",
        margin: "0 0 52px 0",
        textShadow: "0 3px 14px rgba(0,0,0,0.5)",
      }}>
        Who&rsquo;s watching?
      </h2>

      {loading && (
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "18px" }}>Loading profiles…</span>
      )}

      {!loading && profiles.length === 0 && (
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "18px", maxWidth: "420px", textAlign: "center" }}>
          No managed profiles found. Add managed users in Plex (Settings → Users &amp; Sharing).
        </span>
      )}

      <div style={{ display: "flex", gap: "40px", flexWrap: "wrap", justifyContent: "center" }}>
        {profiles.map((profile) => {
          const cosmetic = cosmeticFor(profile.title);
          // Prefer the user's real Plex profile photo; fall back to the cosmetic emoji.
          const showAvatar = !!profile.thumb;
          return (
            <button
              key={profile.uuid}
              onClick={() => !disabled && onSelect(profile)}
              disabled={disabled}
              style={{
                background: "none",
                border: "none",
                cursor: disabled ? "default" : "pointer",
                opacity: disabled ? 0.5 : 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "18px",
                padding: "20px",
                borderRadius: "24px",
                transition: "transform 120ms ease",
              }}
              onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(1.07)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
            >
              <div style={{
                width: "130px",
                height: "130px",
                borderRadius: "50%",
                backgroundColor: cosmetic.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "64px",
                boxShadow: `0 8px 32px ${cosmetic.color}88`,
                lineHeight: 1,
                overflow: "hidden",
              }}>
                {showAvatar
                  ? <img src={profile.thumb} alt={profile.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : cosmetic.emoji}
              </div>
              <span style={{
                color: "white",
                fontSize: "26px",
                fontWeight: "900",
                textShadow: "0 2px 8px rgba(0,0,0,0.4)",
              }}>
                {profile.title}
              </span>
            </button>
          );
        })}
      </div>

      <button
        onClick={onOpenSettings}
        title="Settings"
        aria-label="Settings"
        style={{
          position: "absolute",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)",
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(255,255,255,0.1)",
          border: "none",
          borderRadius: "50%",
          width: "48px",
          height: "48px",
          fontSize: "24px",
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        ⚙️
      </button>
    </div>
  );
}
