import { useState } from "react";

// Per-profile home customization: reorder rows, toggle rails on/off, and choose which
// libraries feed the Wild Card feed. If the admin locked layout editing, a PIN is required.
// "libraries" = the block of per-library rows; it's ordered here but toggled per-library below.
const SECTION_LABELS = {
  continueWatching: "Continue Watching",
  nextUp: "Next Up",
  recentlyAdded: "Recently Added",
  watchAgain: "Watch Again",
  favorites: "Favorites",
  shortPicks: "Short Picks (under 10 min)",
  wildCard: "Wild Card (endless random picks)",
  libraries: "Library rows",
};
const DEFAULT_ORDER = [
  "favorites", "continueWatching", "nextUp", "recentlyAdded",
  "watchAgain", "libraries", "shortPicks", "wildCard",
];

export default function HomeLayoutPanel({ layout, libraries, onClose }) {
  const [needPin, setNeedPin] = useState(!!layout.locked && !layout.unlocked);
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [sections, setSections] = useState({ ...layout.sections });
  const [order, setOrder] = useState(
    layout.sectionOrder?.length ? layout.sectionOrder.slice() : DEFAULT_ORDER.slice()
  );
  const [wild, setWild] = useState(new Set(
    layout.wildcardLibraries && layout.wildcardLibraries.length
      ? layout.wildcardLibraries
      : libraries.map((l) => l.name)
  ));
  // libraryRows: null = every library gets its own row (default); else the explicit list.
  const [rows, setRows] = useState(new Set(
    layout.libraryRows == null ? libraries.map((l) => l.name) : layout.libraryRows
  ));
  const [saving, setSaving] = useState(false);

  async function unlock() {
    setPinErr("");
    const r = await (await fetch("/api/admin/pin/verify", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }),
    })).json();
    if (r.ok) setNeedPin(false);
    else { setPinErr("Wrong PIN."); setPin(""); }
  }

  function toggleSection(key) {
    setSections((s) => ({ ...s, [key]: !s[key] }));
  }
  function move(idx, dir) {
    setOrder((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }
  function toggleWild(name) {
    setWild((prev) => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  }
  function toggleRow(name) {
    setRows((prev) => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/home/layout", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections, sectionOrder: order, libraryRows: [...rows], wildcardLibraries: [...wild] }),
      });
      if (!res.ok) throw new Error();
      onClose(true);
    } catch { setSaving(false); }
  }

  const btn = { border: "none", borderRadius: "999px", padding: "12px 28px", fontSize: "16px", fontWeight: "800", cursor: "pointer" };
  const shell = { minHeight: "100vh", background: "#000", color: "#fff", fontFamily: "sans-serif", display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 24px", boxSizing: "border-box" };
  const row = { display: "flex", alignItems: "center", gap: "16px", padding: "12px 16px", background: "rgba(255,255,255,0.06)", borderRadius: "16px" };
  const sectionTitle = { color: "rgba(255,255,255,0.5)", fontSize: "13px", fontWeight: "800", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 14px 0", alignSelf: "flex-start" };
  const toggleBtn = (on) => ({ ...btn, padding: "8px 18px", fontSize: "14px", background: on ? "#22c55e" : "rgba(255,255,255,0.12)", color: on ? "#04210f" : "rgba(255,255,255,0.6)" });
  const arrowBtn = (disabled) => ({ border: "none", borderRadius: "8px", width: "34px", height: "22px", lineHeight: 1, fontSize: "13px", fontWeight: "900", cursor: disabled ? "default" : "pointer", background: disabled ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.16)", color: disabled ? "rgba(255,255,255,0.18)" : "#fff" });

  if (needPin) {
    return (
      <div style={shell}>
        <h2 style={{ fontSize: "28px", fontWeight: "900", margin: "0 0 8px 0" }}>Home layout is locked</h2>
        <p style={{ color: "rgba(255,255,255,0.5)", margin: "0 0 24px 0" }}>Enter the PIN to change it</p>
        <input type="password" inputMode="numeric" autoFocus value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          onKeyDown={(e) => e.key === "Enter" && unlock()}
          style={{ fontSize: "28px", letterSpacing: "0.3em", textAlign: "center", padding: "12px 16px", borderRadius: "14px", border: "2px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "#fff", width: "200px" }} />
        <div style={{ color: "#fca5a5", minHeight: "20px", margin: "8px 0" }}>{pinErr}</div>
        <div style={{ display: "flex", gap: "16px" }}>
          <button onClick={() => onClose(false)} style={{ ...btn, background: "rgba(255,255,255,0.12)", color: "#fff" }}>Back</button>
          <button onClick={unlock} style={{ ...btn, background: "#6366f1", color: "#fff" }}>Unlock</button>
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <h2 style={{ fontSize: "30px", fontWeight: "900", margin: "0 0 36px 0" }}>Customize Home</h2>
      <div style={{ width: "100%", maxWidth: "460px", display: "flex", flexDirection: "column", gap: "32px" }}>
        <section style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <p style={{ ...sectionTitle, marginBottom: "6px" }}>Arrange rows</p>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", margin: "0 0 8px 0", alignSelf: "flex-start" }}>
            ↑ / ↓ to reorder; toggle a row off to hide it. (Library rows are turned on/off per library below.)
          </p>
          {order.map((key, idx) => (
            <div key={key} style={row}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <button onClick={() => move(idx, -1)} disabled={idx === 0} style={arrowBtn(idx === 0)} aria-label={`Move ${SECTION_LABELS[key]} up`}>↑</button>
                <button onClick={() => move(idx, 1)} disabled={idx === order.length - 1} style={arrowBtn(idx === order.length - 1)} aria-label={`Move ${SECTION_LABELS[key]} down`}>↓</button>
              </div>
              <span style={{ flex: 1, fontSize: "18px", fontWeight: "700" }}>{SECTION_LABELS[key] || key}</span>
              {key === "libraries"
                ? <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>set below</span>
                : <button onClick={() => toggleSection(key)} style={toggleBtn(!!sections[key])}>{sections[key] ? "On" : "Off"}</button>}
            </div>
          ))}
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <p style={{ ...sectionTitle, marginBottom: "6px" }}>Libraries</p>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", margin: "0 0 8px 0", alignSelf: "flex-start" }}>
            Give each library its own row, feed it into Wild Card, or both. (Green = on.)
          </p>
          {libraries.map((l) => (
            <div key={l.name} style={{ ...row, flexWrap: "wrap" }}>
              <span style={{ flex: 1, fontSize: "18px", fontWeight: "700", minWidth: "110px" }}>{l.name}</span>
              <button onClick={() => toggleRow(l.name)} style={toggleBtn(rows.has(l.name))}>Own row</button>
              <button onClick={() => toggleWild(l.name)} style={toggleBtn(wild.has(l.name))}>Wild Card</button>
            </div>
          ))}
        </section>
      </div>

      <div style={{ display: "flex", gap: "16px", marginTop: "40px" }}>
        <button onClick={() => onClose(false)} style={{ ...btn, background: "rgba(255,255,255,0.12)", color: "#fff" }}>Cancel</button>
        <button onClick={save} disabled={saving} style={{ ...btn, background: "#6366f1", color: "#fff", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}
