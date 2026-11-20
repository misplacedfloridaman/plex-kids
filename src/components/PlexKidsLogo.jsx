import logoSrc from "../assets/logo.svg";

// `inline` puts the version to the right of the logo (page headers, where height is tight);
// otherwise it sits centered underneath (profile picker).
export default function PlexKidsLogo({ inline = false }) {
  return (
    <div style={{ display: "flex", flexDirection: inline ? "row" : "column", alignItems: inline ? "flex-end" : "center", gap: inline ? "8px" : "4px" }}>
      <img
        src={logoSrc}
        alt="Plex Kids"
        style={{ height: "75px", width: "auto", display: "block" }}
      />
      <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px", fontWeight: "600", letterSpacing: "0.06em", paddingBottom: inline ? "12px" : 0 }}>
        v3.12.4
      </span>
    </div>
  );
}
