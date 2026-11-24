import { fetch } from "@tauri-apps/plugin-http";

export interface LyricLine {
  time: number;
  text: string;
}

export interface LyricsData {
  synced: LyricLine[] | null;
  plain: string | null;
}

const parseLrc = (lrc: string): LyricLine[] => {
  const lines = lrc.split("\n");
  const result: LyricLine[] = [];
  const regex = /\[(\d{2}):(\d{2})\.?(\d{2,3})?\](.*)/;

  for (const line of lines) {
    const match = regex.exec(line.trim());
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const ms = match[3] ? parseInt(match[3].padEnd(3, "0").slice(0, 3), 10) : 0;
      const time = min * 60 + sec + ms / 1000;
      const text = match[4].trim();
      if (text) {
        result.push({ time, text });
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
};

export async function fetchLyrics(trackName: string): Promise<LyricsData | null> {
  const clean = trackName
    .replace(/\.[^.]+$/, "")
    .replace(/_+/g, " ")
    .replace(/[([][^)\]]*(official|video|audio|lyrics?|hd|hq|4k|remaster|clip|music)[^)\]]*[)\]]/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return null;

  try {
    // 1. Doğrudan arama
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(clean)}`;
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": "MochaPlayer/1.0.0" },
    });

    if (!res.ok) return null;
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) return null;

    const item = items[0];
    const synced = item.syncedLyrics ? parseLrc(item.syncedLyrics) : null;
    const plain = item.plainLyrics || null;

    if (!synced && !plain) return null;
    return { synced, plain };
  } catch {
    return null;
  }
}
