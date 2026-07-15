import { useEffect, useState } from "react";
import { downloadManager, useDownloadsChanged } from "../downloads/useDownloads";
import { videoGridStyle, gridSectionStyle, railTitleStyle } from "../styles";

function formatBytes(n) {
  if (!n) return "0 MB";
  const gb = n / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(n / (1024 * 1024))} MB`;
}

// Fully offline-capable: reads records (incl. cached thumbnail blobs) from IndexedDB, so it
// renders with no network. Tapping a card plays the local copy via the normal player path.
export default function DownloadsScreen({ onPlay }) {
  const [records, setRecords] = useState([]);
  const [thumbs, setThumbs] = useState({}); // id -> object URL
  const [storage, setStorage] = useState(downloadManager.storageInfo());
  const version = useDownloadsChanged(); // bumps when a download completes / is deleted

  useEffect(() => {
    let alive = true;
    let created = [];
    (async () => {
      const list = await downloadManager.list();
      if (!alive) return;
      setRecords(list);
      const map = {};
      for (const r of list) {
        if (r.thumbBlob) {
          const u = URL.createObjectURL(r.thumbBlob);
          map[r.id] = u;
          created.push(u);
        }
      }
      setThumbs(map);
      setStorage(downloadManager.storageInfo());
    })();
    return () => {
      alive = false;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
    // Re-run whenever the download set changes (completed/deleted bumps the version).
  }, [version]);

  if (records.length === 0) {
    return (
      <div style={{ padding: "40px 8px", color: "rgba(255,255,255,0.6)", fontSize: "18px", textAlign: "center" }}>
        No downloads yet. Tap the ⬇ on a show to save it for offline.
      </div>
    );
  }

  const used = storage.usage || 0;
  const budget = storage.budget || 0;
  const pct = budget ? Math.min((used / budget) * 100, 100) : 0;

  return (
    <section style={gridSectionStyle}>
      <h2 style={railTitleStyle}>Downloads</h2>
      {budget > 0 && (
        <div style={{ margin: "0 0 18px", maxWidth: "420px" }}>
          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: "13px", marginBottom: "6px" }}>
            {formatBytes(used)} of {formatBytes(budget)} used
          </div>
          <div style={{ height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.15)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: pct > 90 ? "#ef4444" : "#4ade80", borderRadius: "3px" }} />
          </div>
        </div>
      )}
      <div style={videoGridStyle}>
        {records.map((r) => {
          const item = r.item || {};
          const subtitle = item.grandparentTitle || (item.year ?? "");
          return (
            <div key={r.id} style={{ position: "relative" }}>
              <button
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", width: "100%", textAlign: "left" }}
                onClick={() => onPlay(item)}
              >
                <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: "10px", marginBottom: "8px", backgroundColor: "#111", overflow: "hidden" }}>
                  {thumbs[r.id]
                    ? <img src={thumbs[r.id]} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                    : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "34px" }}>🎬</div>}
                  <div style={{ position: "absolute", bottom: "6px", right: "6px", background: "rgba(0,0,0,0.65)", color: "#4ade80", borderRadius: "6px", fontSize: "11px", fontWeight: 700, padding: "2px 6px" }}>
                    ✓ {formatBytes(r.bytes)}
                  </div>
                </div>
                <div style={{ color: "white", fontSize: "15px", fontWeight: 700, lineHeight: 1.25 }}>{item.title}</div>
                <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "13px" }}>{subtitle || " "}</div>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); downloadManager.remove(item.key); }}
                aria-label="Delete download"
                style={{ position: "absolute", top: "8px", right: "8px", width: "36px", height: "36px", borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)", color: "white", fontSize: "16px", cursor: "pointer", zIndex: 2 }}
              >
                🗑
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
