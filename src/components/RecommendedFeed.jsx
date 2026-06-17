import { useEffect, useRef, useState } from "react";
import MediaCard from "./MediaCard";
import { videoGridStyle } from "../styles";

export default function RecommendedFeed({ onPlay, favorites, onToggleFavorite, apiServer }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const seenKeys = useRef(new Set());
  const loadingRef = useRef(false);
  const sentinelRef = useRef(null);
  const fetchMoreRef = useRef(null);

  async function fetchMore() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    try {
      const res = await fetch(`${apiServer}/api/recommended?count=30`);
      const data = await res.json();
      let newItems = (data.items || []).filter((item) => !seenKeys.current.has(item.key));

      if (newItems.length < 5) {
        seenKeys.current.clear();
        newItems = data.items || [];
      }

      newItems.forEach((item) => seenKeys.current.add(item.key));
      setItems((prev) => [...prev, ...newItems]);
    } catch {
      // fail silently — user can scroll again to retry
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/refs
  fetchMoreRef.current = fetchMore;

  useEffect(() => {
    fetchMoreRef.current();
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchMoreRef.current();
      },
      { rootMargin: "400px" }
    );
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div style={videoGridStyle}>
        {items.map((item) => (
          <MediaCard
            key={item.key}
            item={item}
            onPlay={(i) => onPlay(i, items)}
            apiServer={apiServer}
            isFavorite={favorites.some((f) => f.key === item.key)}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>
      <div ref={sentinelRef} style={{ height: 1, marginTop: "24px" }} />
      {loading && (
        <p style={{ textAlign: "center", color: "rgba(255,255,255,0.6)", fontSize: "20px", padding: "24px 0" }}>
          Loading more...
        </p>
      )}
    </>
  );
}
