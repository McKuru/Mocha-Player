import { readDir, readFile } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
import { join, dirname } from "@tauri-apps/api/path";
import { isAudio, Track } from "../audio/AudioEngine";
import { folderName, getCoverOverride, getVersion, playlistKey, setCoverOverride, trackKey } from "../store";

const IMG = /\.(jpe?g|png|webp|bmp|gif)$/i;
const PREFERRED = /^(cover|folder|front|album|artwork)\./i;
const IMG_EXT = ["jpg", "jpeg", "png", "webp", "bmp", "gif"];

export const stem = (n: string) => n.replace(/\.[^.]+$/, "");

export async function pickFolder() {
  // Dialog ile seçilen yollar fs kapsamına otomatik eklenir (persisted-scope kalıcı yapar)
  const r = await open({ directory: true, multiple: false });
  return typeof r === "string" ? r : null;
}

interface Item { name: string; isFile: boolean }
const dirCache = new Map<string, { v: number; t: number; p: Promise<Item[]> }>();
function readDirCached(dir: string): Promise<Item[]> {
  const c = dirCache.get(dir), v = getVersion("library"), now = Date.now();
  if (c && c.v === v && now - c.t < 3000) return c.p;
  const p = readDir(dir).then(items => items.map(i => ({ name: i.name, isFile: i.isFile })));
  dirCache.set(dir, { v, t: now, p });
  p.catch(() => dirCache.delete(dir));
  return p;
}

/** Klasördeki (alt klasörsüz) ses dosyaları — bir playlist'in şarkıları. */
export async function listTracks(dir: string): Promise<Track[]> {
  const items = await readDir(dir);
  const out: Track[] = [];
  for (const i of items) if (i.isFile && isAudio(i.name)) out.push({ name: i.name, path: await join(dir, i.name) });
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export async function imageUrl(path: string): Promise<string | null> {
  try {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const type = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext ? `image/${ext}` : "";
    return URL.createObjectURL(new Blob([await readFile(path)], { type }));
  } catch { return null; }
}

/** Sıra: elle seçilen → cover/folder.* → (loose ise) klasördeki ilk görsel. */
export async function resolvePlaylistCover(dir: string, loose = true): Promise<string | null> {
  const ov = getCoverOverride(playlistKey(dir)) ?? localStorage.getItem("cover:" + dir);
  if (ov) { const u = await imageUrl(ov); if (u) return u; }
  try {
    const files = (await readDirCached(dir)).filter(f => f.isFile && IMG.test(f.name));
    const pick = files.find(f => PREFERRED.test(f.name)) ?? (loose ? files[0] : undefined);
    if (pick) return imageUrl(await join(dir, pick.name));
  } catch { /* klasör okunamadı */ }
  return null;
}

/** Sıra: şarkıya elle/internetten atanan → aynı adlı görsel (yt-dlp küçük resmi) → playlist kapağı. */
export async function resolveTrackCover(trackPath: string): Promise<string | null> {
  const ov = getCoverOverride(trackKey(trackPath));
  if (ov) { const u = await imageUrl(ov); if (u) return u; }
  try {
    const dir = await dirname(trackPath);
    const base = stem(folderName(trackPath)).toLowerCase();
    const same = (await readDirCached(dir)).find(f => f.isFile && IMG.test(f.name) && stem(f.name).toLowerCase() === base);
    if (same) { const u = await imageUrl(await join(dir, same.name)); if (u) return u; }
    return resolvePlaylistCover(dir, false);
  } catch { return null; }
}

/** Dosyadan kapak seç (şarkı veya playlist anahtarı için). */
export async function chooseCover(key: string): Promise<boolean> {
  const f = await open({ multiple: false, filters: [{ name: "Görsel", extensions: IMG_EXT }] });
  if (typeof f !== "string") return false;
  setCoverOverride(key, f);
  return true;
}
