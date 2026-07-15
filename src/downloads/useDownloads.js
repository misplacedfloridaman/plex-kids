import { useEffect, useState } from "react";
import { downloadManager } from "./manager";

// Subscribe to a single item's download state (re-renders only this card on change).
export function useDownloadItem(ratingKey) {
  const [state, setState] = useState(() => downloadManager.stateFor(ratingKey));
  useEffect(() => {
    const update = () => setState(downloadManager.stateFor(ratingKey));
    update();
    return downloadManager.subscribe(update);
  }, [ratingKey]);
  return state;
}

// Version-bump subscription — returns a counter that increments on any manager change, for
// screens that list all downloads / storage usage.
export function useDownloadsChanged() {
  const [version, bump] = useState(0);
  useEffect(() => downloadManager.subscribe(() => bump((n) => n + 1)), []);
  return version;
}

export { downloadManager };
