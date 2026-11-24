import { fetch } from "@tauri-apps/plugin-http";
import { appDataDir, join } from "@tauri-apps/api/path";
import { mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { getCoverOverride, getSettings, setCoverOverride } from "../store";

export type Kind = "track" | "album";

export interface CoverCandidate {
  url: string;
  previewUrl: string;
  title: string;
  subtitle: string;
  source: "iTunes" | "YouTube" | "Deezer";
}

/** Dosya adındaki gürültüyü (uzantı, "(Official Video)", "(Sözleriyle)", "prod. by ..." vb.) temizler. */
export function cleanQuery(name: string) {
  return name
    .replace(/(\.(mp3|wav|flac|aac|m4a|ogg|oga|opus|webm))+$/gi, "")
    .replace(/\.[^.]+$/, "")
    .replace(/_+/g, " ")
    .replace(
      /[([][^)\]]*(official|video|audio|lyrics?|sözler\w*|şarkı söz\w*|parodi|full alb[üu]m|hd|hq|4k|remaster\w*|clip|music|akustik|acoustic|live)[^)\]]*[)\]]/gi,
      ""
    )
    .replace(/\bprod\.?\s*by\b.*$/i, "")
    .replace(/\|.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 1. Birincil Kaynak: iTunes Search API (yüksek çözünürlüklü 600x600 kapaklar)
async function itunesCandidates(q: string, kind: Kind): Promise<CoverCandidate[]> {
  try {
    const entity = kind === "album" ? "album" : "song";
    const r = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=${entity}&limit=8`
    );
    if (!r.ok) return [];
    const json = await r.json();
    const results: Array<Record<string, string>> = json.results ?? [];
    const out: CoverCandidate[] = [];
    for (const item of results) {
      const u = item.artworkUrl100;
      if (!u) continue;
      out.push({
        url: u.replace(/\d+x\d+bb/, "600x600bb"),
        previewUrl: u.replace(/\d+x\d+bb/, "300x300bb"),
        title: item.trackName || item.collectionName || q,
        subtitle: item.artistName || "iTunes",
        source: "iTunes",
      });
    }
    return out;
  } catch {
    return [];
  }
}

// 2. İkincil Kaynak: YouTube Arama Sonuçları (birden fazla alternatif video kapağı)
async function youtubeCandidates(q: string): Promise<CoverCandidate[]> {
  const out: CoverCandidate[] = [];
  const seenIds = new Set<string>();

  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    const r = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });
    if (r.ok) {
      const html = await r.text();
      // Önce videoRenderer bloklarından başlık ve videoId eşleştir
      const rendererRegex =
        /"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})".*?"title":\{"runs":\[\{"text":"([^"]+)"/g;
      let match: RegExpExecArray | null;
      while ((match = rendererRegex.exec(html)) !== null && out.length < 6) {
        const videoId = match[1];
        const title = match[2]?.replace(/\\u0026/g, "&") || q;
        if (seenIds.has(videoId)) continue;
        seenIds.add(videoId);
        const hq = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        out.push({
          url: hq,
          previewUrl: hq,
          title,
          subtitle: "YouTube",
          source: "YouTube",
        });
      }

      // Eğer yukarıdaki desen az sonuç bulduysa genel videoId eşleşmelerinden tamamla
      if (out.length < 4) {
        const idRegex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
        while ((match = idRegex.exec(html)) !== null && out.length < 6) {
          const videoId = match[1];
          if (seenIds.has(videoId)) continue;
          seenIds.add(videoId);
          const hq = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          out.push({
            url: hq,
            previewUrl: hq,
            title: `${q} (#${out.length + 1})`,
            subtitle: "YouTube",
            source: "YouTube",
          });
        }
      }
    }
  } catch {
    // Doğrudan HTTP başarısız olursa yt-dlp fallback'ine geç
  }

  if (out.length === 0) {
    const s = getSettings();
    if (s.ytdlpDir) {
      try {
        const thumb = await invoke<string>("ytdlp_search_thumbnail", {
          ytdlpDir: s.ytdlpDir,
          query: q,
        });
        if (thumb && thumb.startsWith("http")) {
          out.push({
            url: thumb,
            previewUrl: thumb,
            title: q,
            subtitle: "YouTube (yt-dlp)",
            source: "YouTube",
          });
        }
      } catch {
        // yoksay
      }
    }
  }

  return out;
}

// 3. Üçüncü Kaynak: Deezer API
async function deezerCandidates(q: string, kind: Kind): Promise<CoverCandidate[]> {
  try {
    const r = await fetch(
      `https://api.deezer.com/search/${kind === "album" ? "album" : "track"}?q=${encodeURIComponent(q)}&limit=6`
    );
    if (!r.ok) return [];
    const data: Array<Record<string, any>> = (await r.json()).data ?? [];
    const out: CoverCandidate[] = [];
    for (const d of data) {
      const full = kind === "album" ? d?.cover_xl || d?.cover_big : d?.album?.cover_xl || d?.album?.cover_big;
      const prev = kind === "album" ? d?.cover_medium || full : d?.album?.cover_medium || full;
      if (!full) continue;
      out.push({
        url: full,
        previewUrl: prev || full,
        title: d?.title || q,
        subtitle: d?.artist?.name ? `${d.artist.name} • Deezer` : "Deezer",
        source: "Deezer",
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Verilen sorgu için iTunes, YouTube ve Deezer'dan çoklu kapak adaylarını getirir.
 */
export async function searchCoverCandidates(q: string, kind: Kind): Promise<CoverCandidate[]> {
  const cleaned = cleanQuery(q) || q.trim();
  if (!cleaned) return [];

  const [it, yt, dz] = await Promise.all([
    itunesCandidates(cleaned, kind),
    youtubeCandidates(cleaned),
    deezerCandidates(cleaned, kind),
  ]);

  const seenUrls = new Set<string>();
  const combined: CoverCandidate[] = [];

  for (const c of [...it, ...yt, ...dz]) {
    if (seenUrls.has(c.url)) continue;
    seenUrls.add(c.url);
    combined.push(c);
  }

  return combined;
}

export async function findCoverOnline(q: string, kind: Kind): Promise<string | null> {
  const list = await searchCoverCandidates(q, kind);
  return list[0]?.url ?? null;
}

const hash = (s: string) => {
  let h = 5381;
  for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) | 0;
  return (h >>> 0).toString(16);
};

// Her anahtar (şarkı/playlist) için daha önce denenmiş kapak URL'lerini takip et
function getUsedUrls(key: string): string[] {
  try {
    const all = JSON.parse(localStorage.getItem("cover_used_urls") || "{}") as Record<string, string[]>;
    return all[key] ?? [];
  } catch {
    return [];
  }
}

function markUrlUsed(key: string, url: string) {
  try {
    const all = JSON.parse(localStorage.getItem("cover_used_urls") || "{}") as Record<string, string[]>;
    const prev = all[key] ?? [];
    const next = [...prev.filter(u => u !== url), url].slice(-20);
    all[key] = next;
    localStorage.setItem("cover_used_urls", JSON.stringify(all));
  } catch {
    // yoksay
  }
}

/** Seçilen bir kapak URL'sini indirip `key` için kaydeder. */
export async function applyCoverUrl(key: string, rawUrl: string): Promise<boolean> {
  if (!rawUrl) return false;
  try {
    let targetUrl = rawUrl;
    // YouTube hqdefault ise önce maxresdefault var mı diye kontrol et
    const ytMatch = rawUrl.match(/^https:\/\/i\.ytimg\.com\/vi\/([a-zA-Z0-9_-]{11})\/hqdefault\.jpg$/);
    if (ytMatch) {
      const maxRes = `https://i.ytimg.com/vi/${ytMatch[1]}/maxresdefault.jpg`;
      try {
        const testMax = await fetch(maxRes, { method: "HEAD" });
        if (testMax.ok) targetUrl = maxRes;
      } catch {
        // hqdefault ile devam
      }
    }

    const res = await fetch(targetUrl);
    if (!res.ok) return false;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length < 500) return false;

    const dir = await join(await appDataDir(), "covers");
    await mkdir(dir, { recursive: true }).catch(() => {});
    const file = await join(dir, `${hash(key)}_${Date.now()}.jpg`);
    await writeFile(file, bytes);
    markUrlUsed(key, rawUrl);
    setCoverOverride(key, file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kapağı uygulama verisi klasörüne indirir ve `key` için kaydeder.
 * Eğer şarkının/playlistin halihazırda bir kapağı varsa veya `preferAlternative=true` ise,
 * daha önce kullanılmamış alternatif bir kapak seçer.
 */
export async function fetchAndSetCover(
  key: string,
  query: string,
  kind: Kind,
  preferAlternative = false
): Promise<boolean> {
  if (!query) return false;
  const candidates = await searchCoverCandidates(query, kind);
  if (candidates.length === 0) return false;

  const hasExisting = Boolean(getCoverOverride(key));
  const used = getUsedUrls(key);

  let ordered = candidates;
  if ((hasExisting || preferAlternative) && candidates.length > 1) {
    const unused = candidates.filter(c => !used.includes(c.url));
    if (unused.length > 0) {
      ordered = [...unused, ...candidates.filter(c => used.includes(c.url))];
    } else {
      // Tüm adaylar denendiyse en son kullanılandan farklı olan ilk adayı seç
      const lastUsed = used[used.length - 1];
      ordered = [
        ...candidates.filter(c => c.url !== lastUsed),
        ...candidates.filter(c => c.url === lastUsed),
      ];
    }
  }

  for (const candidate of ordered) {
    if (await applyCoverUrl(key, candidate.url)) {
      return true;
    }
  }
  return false;
}

export default {
  cleanQuery,
  findCoverOnline,
  searchCoverCandidates,
  applyCoverUrl,
  fetchAndSetCover,
};
