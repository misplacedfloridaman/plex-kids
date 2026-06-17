import { useEffect, useRef, useState } from "react";
import { cosmeticFor } from "../profiles";

// Settings screen (reached from the profile picker), guarded by a PIN:
//   - Daily access = enter the PIN (kids don't know it).
//   - The PIN is set/reset only right after a Plex owner sign-in (OAuth), which also
//     bootstraps the admin token on a fresh install. "Forgot PIN?" routes through Plex.
// Modes: loading | pin | plex | setpin | settings
export default function Settings({ onClose }) {
  const [mode, setMode] = useState("loading");
  const [pinInput, setPinInput] = useState("");
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [msg, setMsg] = useState("");
  const [auth, setAuth] = useState({ code: "", waiting: false });

  const [profilesAll, setProfilesAll] = useState([]);
  const [hidden, setHidden] = useState(new Set());
  const [lockHomeLayout, setLockHomeLayout] = useState(false);
  const [saving, setSaving] = useState(false);

  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  async function refreshState() {
    const s = await (await fetch("/api/admin/state")).json();
    if (s.unlocked) { setMode("settings"); loadSettingsData(); return s; }
    if (s.hasPin) { setMode("pin"); return s; }
    if (s.ownerVerified) { setMode("setpin"); return s; }
    setMode("plex"); // no PIN yet (or no token) → must verify with Plex first
    return s;
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshState().catch(() => setMsg("Couldn't reach the server."));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSettingsData() {
    try {
      const [p, s] = await Promise.all([
        fetch("/api/profiles?all=1").then((r) => r.json()),
        fetch("/api/settings").then((r) => r.json()),
      ]);
      const profs = p.profiles || [];
      setProfilesAll(profs);
      setHidden(new Set(profs.filter((x) => x.hidden).map((x) => x.uuid)));
      setLockHomeLayout(!!s.lockHomeLayout);
    } catch { /* leave empty */ }
  }

  async function submitPin() {
    setMsg("");
    const r = await (await fetch("/api/admin/pin/verify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pinInput }),
    })).json();
    if (r.ok) { setMode("settings"); loadSettingsData(); }
    else { setMsg("Wrong PIN."); setPinInput(""); }
  }

  // Plex owner sign-in (bootstrap token / authorize PIN set/reset).
  async function startPlex() {
    setMsg(""); setAuth({ code: "", waiting: true });
    try {
      const { pinId, code, authUrl } = await (await fetch("/api/admin/auth/start", { method: "POST" })).json();
      setAuth({ code, waiting: true });
      window.open(authUrl, "_blank", "noopener");
      const deadline = Date.now() + 120000;
      const tick = async () => {
        if (!aliveRef.current) return;
        if (Date.now() > deadline) { setAuth({ code: "", waiting: false }); setMsg("Sign-in timed out."); return; }
        try {
          const r = await (await fetch(`/api/admin/auth/poll?pinId=${pinId}`)).json();
          if (!aliveRef.current) return;
          if (r.admin) { setAuth({ code: "", waiting: false }); setMode("setpin"); return; }
          if (r.pending) { setTimeout(tick, 2000); return; }
          setAuth({ code: "", waiting: false }); setMsg("That account isn't the server owner.");
        } catch { setTimeout(tick, 2500); }
      };
      setTimeout(tick, 2500);
    } catch { setAuth({ code: "", waiting: false }); setMsg("Couldn't start sign-in."); }
  }

  async function submitNewPin() {
    setMsg("");
    if (!/^\d{4,8}$/.test(pin1)) { setMsg("PIN must be 4–8 digits."); return; }
    if (pin1 !== pin2) { setMsg("PINs don't match."); return; }
    const r = await fetch("/api/admin/pin/set", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pin1 }),
    });
    if (r.ok) { setPin1(""); setPin2(""); setMode("settings"); loadSettingsData(); }
    else { setMsg("Couldn't set PIN — verify with Plex again."); }
  }

  function toggleSet(setter, value) {
    setter((prev) => { const n = new Set(prev); n.has(value) ? n.delete(value) : n.add(value); return n; });
  }

  async function save() {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenProfiles: [...hidden], lockHomeLayout }),
      });
      onClose(true);
    } catch { setSaving(false); }
  }

  const btn = { border: "none", borderRadius: "999px", padding: "12px 28px", fontSize: "16px", fontWeight: "800", cursor: "pointer" };
  const shell = {
    minHeight: "100vh", background: "#000", color: "#fff", fontFamily: "sans-serif",
    display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 24px", boxSizing: "border-box",
  };
  const pinInputStyle = {
    fontSize: "28px", letterSpacing: "0.3em", textAlign: "center", padding: "12px 16px",
    borderRadius: "14px", border: "2px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)",
    color: "#fff", width: "200px", marginBottom: "14px",
  };
  const errStyle = { color: "#fca5a5", margin: "8px 0", minHeight: "20px" };
  const back = <button onClick={() => onClose(false)} style={{ ...btn, background: "rgba(255,255,255,0.12)", color: "#fff" }}>Back</button>;

  if (mode === "loading") return <div style={shell}><span style={{ color: "rgba(255,255,255,0.5)", marginTop: "40px" }}>Loading…</span></div>;

  // Enter PIN (daily)
  if (mode === "pin") {
    return (
      <div style={shell}>
        <h2 style={{ fontSize: "30px", fontWeight: "900", margin: "0 0 8px 0" }}>Settings</h2>
        <p style={{ color: "rgba(255,255,255,0.5)", margin: "0 0 28px 0" }}>Enter your PIN</p>
        <input
          type="password" inputMode="numeric" autoFocus value={pinInput}
          onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 8))}
          onKeyDown={(e) => e.key === "Enter" && submitPin()}
          style={pinInputStyle}
        />
        <div style={errStyle}>{msg}</div>
        <div style={{ display: "flex", gap: "16px", marginTop: "8px" }}>
          {back}
          <button onClick={submitPin} style={{ ...btn, background: "#6366f1", color: "#fff" }}>Unlock</button>
        </div>
        <button onClick={startPlex} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", marginTop: "24px", textDecoration: "underline" }}>
          Forgot PIN?
        </button>
      </div>
    );
  }

  // Plex owner sign-in
  if (mode === "plex") {
    return (
      <div style={shell}>
        <h2 style={{ fontSize: "30px", fontWeight: "900", margin: "0 0 8px 0" }}>Settings</h2>
        <p style={{ color: "rgba(255,255,255,0.5)", margin: "0 0 28px 0", textAlign: "center", maxWidth: "420px" }}>
          Sign in as the Plex server owner to set your settings PIN.
        </p>
        {!auth.waiting && <button onClick={startPlex} style={{ ...btn, background: "#e5a00d", color: "#1a1300" }}>Sign in with Plex</button>}
        {auth.waiting && (
          <div style={{ textAlign: "center", maxWidth: "420px" }}>
            <p style={{ margin: "0 0 10px 0" }}>Approve in the Plex window that opened.</p>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px", margin: "0 0 12px 0" }}>Or go to <b>plex.tv/link</b> and enter:</p>
            {auth.code && <div style={{ fontSize: "26px", fontWeight: "900", letterSpacing: "0.2em" }}>{auth.code}</div>}
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "14px" }}>Waiting…</span>
          </div>
        )}
        <div style={errStyle}>{msg}</div>
        <div style={{ marginTop: "16px" }}>{back}</div>
      </div>
    );
  }

  // Set / reset PIN
  if (mode === "setpin") {
    return (
      <div style={shell}>
        <h2 style={{ fontSize: "30px", fontWeight: "900", margin: "0 0 8px 0" }}>Set a settings PIN</h2>
        <p style={{ color: "rgba(255,255,255,0.5)", margin: "0 0 28px 0", textAlign: "center", maxWidth: "420px" }}>
          4–8 digits. You'll enter this to open Settings (not your Plex password).
        </p>
        <input type="password" inputMode="numeric" autoFocus placeholder="New PIN" value={pin1}
          onChange={(e) => setPin1(e.target.value.replace(/\D/g, "").slice(0, 8))} style={pinInputStyle} />
        <input type="password" inputMode="numeric" placeholder="Confirm PIN" value={pin2}
          onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 8))}
          onKeyDown={(e) => e.key === "Enter" && submitNewPin()} style={pinInputStyle} />
        <div style={errStyle}>{msg}</div>
        <div style={{ display: "flex", gap: "16px" }}>
          {back}
          <button onClick={submitNewPin} style={{ ...btn, background: "#6366f1", color: "#fff" }}>Save PIN</button>
        </div>
      </div>
    );
  }

  // Unlocked — the actual settings
  const sectionTitle = { color: "rgba(255,255,255,0.5)", fontSize: "13px", fontWeight: "800", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 14px 0", alignSelf: "flex-start" };
  const row = { display: "flex", alignItems: "center", gap: "16px", padding: "12px 16px", background: "rgba(255,255,255,0.06)", borderRadius: "16px" };
  return (
    <div style={shell}>
      <h2 style={{ fontSize: "30px", fontWeight: "900", margin: "0 0 36px 0" }}>Settings</h2>
      <div style={{ width: "100%", maxWidth: "460px", display: "flex", flexDirection: "column", gap: "32px" }}>
        <section style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <p style={sectionTitle}>Show these profiles on the picker</p>
          {profilesAll.map((p) => {
            const cosmetic = cosmeticFor(p.title);
            const isHidden = hidden.has(p.uuid);
            return (
              <div key={p.uuid} style={row}>
                <div style={{ width: "44px", height: "44px", borderRadius: "50%", backgroundColor: cosmetic.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", overflow: "hidden", flexShrink: 0 }}>
                  {p.thumb
                    ? <img src={p.thumb} alt={p.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : cosmetic.emoji}
                </div>
                <span style={{ flex: 1, fontSize: "18px", fontWeight: "700" }}>{p.title}</span>
                <button onClick={() => toggleSet(setHidden, p.uuid)} style={{ ...btn, padding: "8px 18px", fontSize: "14px", background: isHidden ? "rgba(255,255,255,0.12)" : "#22c55e", color: isHidden ? "rgba(255,255,255,0.6)" : "#04210f" }}>
                  {isHidden ? "Hidden" : "Shown"}
                </button>
              </div>
            );
          })}
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <p style={sectionTitle}>Home layout</p>
          <div style={row}>
            <span style={{ flex: 1, fontSize: "18px", fontWeight: "700" }}>
              Require PIN to change home layout
              <span style={{ display: "block", fontSize: "13px", fontWeight: "400", color: "rgba(255,255,255,0.45)" }}>
                Stops kids rearranging their own home page
              </span>
            </span>
            <button onClick={() => setLockHomeLayout((v) => !v)} style={{ ...btn, padding: "8px 18px", fontSize: "14px", background: lockHomeLayout ? "#22c55e" : "rgba(255,255,255,0.12)", color: lockHomeLayout ? "#04210f" : "rgba(255,255,255,0.6)" }}>
              {lockHomeLayout ? "Locked" : "Off"}
            </button>
          </div>
        </section>
      </div>

      <div style={{ display: "flex", gap: "16px", marginTop: "40px" }}>
        <button onClick={() => onClose(false)} style={{ ...btn, background: "rgba(255,255,255,0.12)", color: "#fff" }}>Cancel</button>
        <button onClick={save} disabled={saving} style={{ ...btn, background: "#6366f1", color: "#fff", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}
