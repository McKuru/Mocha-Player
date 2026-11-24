import { useEffect, useState } from "react";
import { useStoreVersion } from "./store";
import { resolvePlaylistCover, resolveTrackCover } from "./fs/library";

/** Şarkı veya playlist kapağını blob URL olarak verir; kapak/kütüphane değişince yenilenir. */
export function useCoverUrl(kind: "track" | "playlist", path: string | undefined) {
  const ver = useStoreVersion("covers", "library");
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    let alive = true, made: string | null = null;
    (kind === "track" ? resolveTrackCover(path) : resolvePlaylistCover(path)).then(u => {
      if (!alive) { if (u) URL.revokeObjectURL(u); return; }
      made = u; setUrl(u);
    });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [kind, path, ver]);
  return url;
}
