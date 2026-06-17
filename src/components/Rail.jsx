import { useEffect, useState } from "react";
import MediaCard from "./MediaCard";
import { gridSectionStyle, railTitleStyle, railStyle } from "../styles";

// A home-page rail backed by an API endpoint. Fetches on mount; renders nothing if empty.
export default function Rail({ title, url, onPlay, apiServer, favoriteKeys, onToggleFavorite }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let alive = true;
    fetch(`${apiServer}${url}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setItems(d.items || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [url, apiServer]);

  if (items.length === 0) return null;

  return (
    <section style={gridSectionStyle}>
      <h2 style={railTitleStyle}>{title}</h2>
      <div style={railStyle}>
        {items.map((item) => (
          <MediaCard
            key={item.key}
            item={item}
            onPlay={onPlay}
            apiServer={apiServer}
            horizontal
            isFavorite={favoriteKeys.has(item.key)}
            onToggleFavorite={onToggleFavorite}
            subtitle={item.progress ? `${Math.round(item.progress * 100)}% watched` : undefined}
          />
        ))}
      </div>
    </section>
  );
}
