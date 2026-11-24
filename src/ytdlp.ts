import { Channel, invoke } from "@tauri-apps/api/core";
import { getSettings } from "./store";

export type UrlKind = "video" | "playlist";

export interface ClassifiedYoutube {
  kind: UrlKind;
  url: string;
  hasBoth?: boolean;
  playlistUrl?: string;
  videoUrl?: string;
}

/** Yalnızca YouTube bağlantılarını kabul eder ve şarkı mı playlist mi olduğunu bağlantıdan anlar. */
export function classifyYoutube(raw: string): ClassifiedYoutube | null {
  let trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(trimmed)) {
    trimmed = "https://" + trimmed;
  }

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  u.protocol = "https:";

  const host = u.hostname.replace(/^(www|m|music)\./, "");
  const url = u.toString();

  if (host === "youtu.be") {
    const videoId = u.pathname.slice(1).split("/")[0];
    if (!videoId) return null;
    const listId = u.searchParams.get("list");
    if (listId) {
      const playlistUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`;
      const videoUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
      const isRadio = listId.startsWith("RD");
      return {
        kind: isRadio ? "video" : "playlist",
        url: isRadio ? videoUrl : playlistUrl,
        hasBoth: true,
        playlistUrl,
        videoUrl,
      };
    }
    return { kind: "video", url };
  }

  if (host !== "youtube.com") return null;

  if (u.pathname.startsWith("/playlist")) {
    const listId = u.searchParams.get("list");
    if (!listId) return null;
    return {
      kind: "playlist",
      url: `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`,
    };
  }

  if (u.pathname === "/watch") {
    const videoId = u.searchParams.get("v");
    const listId = u.searchParams.get("list");
    if (videoId && listId) {
      const playlistUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`;
      const videoUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
      const isRadio = listId.startsWith("RD");
      return {
        kind: isRadio ? "video" : "playlist",
        url: isRadio ? videoUrl : playlistUrl,
        hasBoth: true,
        playlistUrl,
        videoUrl,
      };
    }
    if (videoId) {
      return { kind: "video", url };
    }
    if (listId) {
      return {
        kind: "playlist",
        url: `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`,
      };
    }
  }

  if (/^\/(shorts|live)\//.test(u.pathname)) {
    return { kind: "video", url };
  }

  return null;
}

/** Rust tarafındaki yt-dlp komutunu çalıştırır; indirilen klasörün yolunu döner. */
export function downloadWithYtdlp(
  url: string,
  kind: UrlKind,
  targetDir: string,
  onLine: (l: string) => void
) {
  const s = getSettings();
  const ch = new Channel<string>();
  ch.onmessage = onLine;
  return invoke<string>("ytdlp_download", {
    ytdlpDir: s.ytdlpDir,
    url,
    outDir: targetDir,
    newPlaylist: kind === "playlist",
    onLine: ch,
  });
}

/** Belirtilen üst klasör içinde verilen isimle yeni bir boş playlist klasörü oluşturur. */
export function createPlaylistFolder(parentDir: string, name: string) {
  return invoke<string>("create_playlist_folder", {
    parentDir,
    name,
  });
}
