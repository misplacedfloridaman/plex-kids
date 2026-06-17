import logoSrc from "../assets/logo.svg";

export default function PlexKidsLogo() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
      <img
        src={logoSrc}
        alt="Plex Kids"
        style={{ height: "75px", width: "auto", display: "block" }}
      />
      <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px", fontWeight: "600", letterSpacing: "0.06em" }}>
        v3.7.4
      </span>
    </div>
  );
}
