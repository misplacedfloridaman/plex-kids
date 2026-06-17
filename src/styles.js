// Plex Kids shared style exports
// We will gradually move styles out of App.jsx into this file.

export const pageStyle = {
  minHeight: "100vh",
  background: "#000",
  // Fluid padding: tight on phones, full breathing room on iPad+.
  padding: "clamp(12px, 4vw, 28px)",
  paddingLeft: "max(clamp(12px, 4vw, 28px), env(safe-area-inset-left))",
  paddingRight: "max(clamp(12px, 4vw, 28px), env(safe-area-inset-right))",
  fontFamily: "sans-serif",
  boxSizing: "border-box",
  color: "white",
};

export const homeTitleStyle = {
  fontSize: "clamp(30px, 6vw, 52px)",
  lineHeight: 1,
  margin: "0 0 clamp(18px, 4vw, 32px) 0",
  fontWeight: "900",
  color: "white",
  textShadow: "0 4px 18px rgba(0,0,0,0.45)",
};

export const libraryTitleStyle = {
  fontSize: "clamp(26px, 5vw, 38px)",
  lineHeight: 1,
  margin: 0,
  fontWeight: "900",
  color: "white",
  textShadow: "0 4px 18px rgba(0,0,0,0.45)",
};

export const railTitleStyle = {
  fontSize: "clamp(20px, 4vw, 30px)",
  lineHeight: 1,
  margin: "0 0 clamp(10px, 2vw, 18px) 0",
  fontWeight: "900",
  color: "white",
  textShadow: "0 3px 12px rgba(0,0,0,0.4)",
};


export const itemInfoStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "3px",
};

export const itemTitleStyle = {
  lineHeight: 1.2,
  color: "#111827",
  fontSize: "15px",
  fontWeight: "900",
  overflow: "hidden",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  // Always reserve two lines so 1-line and 2-line titles produce equal-height cards.
  height: "2.4em",
};

export const gridStyle = {
  display: "grid",
  // Fluid min so phones get ~2 columns instead of one giant card; iPad keeps 4–6.
  gridTemplateColumns: "repeat(auto-fill, minmax(clamp(140px, 42vw, 175px), 1fr))",
  gap: "clamp(12px, 2vw, 20px)",
  alignItems: "stretch",
};

export const railSectionStyle = {
  marginTop: "10px",
};

export const railStyle = {
  display: "flex",
  gap: "16px",
  overflowX: "auto",
  overflowY: "hidden",
  padding: "4px 4px 18px 4px",
  scrollSnapType: "x proximity",
  WebkitOverflowScrolling: "touch",
};

// Fixed width for cards inside a horizontal rail so they don't squash.
// Fluid so phones get a comfortable card without dwarfing the screen; iPad keeps 220px.
export const railCardStyle = {
  flex: "0 0 clamp(150px, 55vw, 220px)",
  width: "clamp(150px, 55vw, 220px)",
  scrollSnapAlign: "start",
};

export const gridSectionStyle = {
  marginTop: "clamp(24px, 5vw, 40px)",
};

export const videoGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(clamp(150px, 44vw, 260px), 1fr))",
  gap: "clamp(12px, 2vw, 16px)",
  alignItems: "start",
};


export const videoCardStyle = {
  backgroundColor: "white",
  border: "none",
  borderRadius: "16px",
  padding: "10px",
  cursor: "pointer",
  fontSize: "16px",
  fontWeight: "800",
  boxShadow: "0 6px 16px rgba(0,0,0,0.13)",
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-start",
  textAlign: "left",
  transition: "transform 120ms ease, box-shadow 120ms ease",
};

export const posterStyle = {
  width: "100%",
  aspectRatio: "16 / 9",
  objectFit: "contain",
  borderRadius: "10px",
  marginBottom: "8px",
  backgroundColor: "white",
  flexShrink: 0,
};

export const itemMetaStyle = {
  fontSize: "15px",
  lineHeight: 1.2,
  color: "#6b7280",
  fontWeight: "700",
  // Always reserve one line (rendered empty when there's no subtitle) for uniform height.
  minHeight: "1.2em",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
};

export const libraryHeaderStyle = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  display: "flex",
  alignItems: "center",
  gap: "16px",
  padding: "12px 0 16px",
  marginBottom: "8px",
  background: "linear-gradient(180deg, #000 85%, transparent 100%)",
};

export const searchWrapStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  backgroundColor: "rgba(255,255,255,0.12)",
  backdropFilter: "blur(20px) saturate(180%)",
  WebkitBackdropFilter: "blur(20px) saturate(180%)",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: "999px",
  padding: "12px 20px",
  marginBottom: "28px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)",
};

export const searchInputStyle = {
  flex: 1,
  border: "none",
  outline: "none",
  fontSize: "20px",
  fontWeight: "600",
  color: "white",
  backgroundColor: "transparent",
  fontFamily: "system-ui, -apple-system, sans-serif",
};

export const backButtonStyle = {
  border: "none",
  borderRadius: "50%",
  width: "52px",
  height: "52px",
  fontSize: "24px",
  fontWeight: "900",
  cursor: "pointer",
  backgroundColor: "white",
  boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};


export const fullscreenPlayerWrapStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  width: "100vw",
  height: "100vh",
  borderRadius: 0,
  marginBottom: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "black",
};

export const playerOverlayStyle = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "16px",
  padding: "22px",
  flexWrap: "wrap",
  background: "linear-gradient(to top, rgba(0,0,0,0.86), rgba(0,0,0,0.48), rgba(0,0,0,0))",
  transition: "opacity 220ms ease",
};

export const playerTitleStyle = {
  color: "white",
  fontSize: "22px",
  margin: 0,
  fontWeight: "900",
  lineHeight: 1.1,
  flex: 1,
  minWidth: 0,
  textAlign: "center",
  textShadow: "0 3px 12px rgba(0,0,0,0.65)",
};


export const fullscreenVideoPlayerStyle = {
  width: "100vw",
  height: "100vh",
  maxHeight: "100vh",
  objectFit: "contain",
};

export const playerLeftControlsStyle = {
  display: "flex",
  justifyContent: "flex-start",
  minWidth: "72px",
};

export const playerButtonGroupStyle = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  minWidth: "180px",
};

export const playerControlButtonStyle = {
  border: "none",
  borderRadius: "999px",
  width: "54px",
  height: "54px",
  fontSize: "24px",
  fontWeight: "900",
  cursor: "pointer",
  backgroundColor: "#facc15",
  color: "#111827",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 6px 18px rgba(0,0,0,0.28)",
};

export const primaryPlayerControlButtonStyle = {
  ...playerControlButtonStyle,
  width: "68px",
  height: "68px",
  fontSize: "32px",
  backgroundColor: "#22c55e",
};

export const closePlayerButtonStyle = {
  ...playerControlButtonStyle,
  backgroundColor: "white",
  color: "#111827",
};

export const playerErrorStyle = {
  color: "#fecaca",
  fontSize: "16px",
  fontWeight: "700",
  marginTop: "12px",
};

export const librariesNavButtonStyle = {
  border: "none",
  borderRadius: "999px",
  padding: "10px 22px",
  backgroundColor: "rgba(255,255,255,0.15)",
  color: "white",
  fontSize: "18px",
  fontWeight: "900",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flexShrink: 0,
};
