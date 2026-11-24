import { useSyncExternalStore } from "react";
import { DEFAULT_THEME, ThemeSettings } from "./theme";

// ---- küçük reaktif localStorage deposu ----
const versions: Record<string, number> = {};
let total = 0;
const listeners = new Set<() => void>();
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

export function bump(key: string) {
  versions[key] = (versions[key] ?? 0) + 1;
  total++;
  listeners.forEach(f => f());
}
export const getVersion = (key: string) => versions[key] ?? 0;

/** Verilen anahtarlardan biri değişince bileşeni yeniden render eder. */
export function useStoreVersion(...keys: string[]) {
  return useSyncExternalStore(subscribe, () =>
    keys.length ? keys.reduce((a, k) => a + (versions[k] ?? 0), 0) : total);
}

function read<T>(key: string, def: T): T {
  try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : def; }
  catch { return def; }
}
function write<T>(key: string, v: T) { localStorage.setItem(key, JSON.stringify(v)); bump(key); }

/** İndirme bitince / klasör içeriği değişince çağır. */
export const refreshLibrary = () => bump("library");

export const folderName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

// ---- playlistler (= klasörler) ----
export interface Playlist { path: string; name?: string }
export const getPlaylists = () => read<Playlist[]>("playlists", []);
export function addPlaylist(path: string, name?: string) {
  const l = getPlaylists();
  if (l.some(p => p.path.toLowerCase() === path.toLowerCase())) return;
  write("playlists", [...l, { path, name }]);
}
export const renamePlaylist = (path: string, name: string) =>
  write("playlists", getPlaylists().map(p => p.path === path ? { ...p, name: name.trim() || undefined } : p));
export const removePlaylist = (path: string) =>
  write("playlists", getPlaylists().filter(p => p.path !== path));

export const displayName = (p: Playlist) =>
  p.name || (p.path === getSettings().downloadsDir ? "İndirilenler" : folderName(p.path));

// ---- kapaklar (elle seçilen / internetten indirilen) ----
const covers = () => read<Record<string, string>>("covers", {});
export const trackKey = (p: string) => "track:" + p;
export const playlistKey = (p: string) => "pl:" + p;
export const getCoverOverride = (key: string) => covers()[key] ?? null;
export const setCoverOverride = (key: string, img: string) => write("covers", { ...covers(), [key]: img });

// ---- beğenilen şarkılar (favorites) ----
export const getFavorites = () => read<string[]>("favorites", []);
export const isFavorite = (path: string) => getFavorites().includes(path);
export function toggleFavorite(path: string) {
  const favs = getFavorites();
  const next = favs.includes(path) ? favs.filter(p => p !== path) : [...favs, path];
  write("favorites", next);
  bump("favorites");
}

// ---- ayarlar ----
export interface AppSettings { ytdlpDir: string; downloadsDir: string }
export const getSettings = (): AppSettings =>
  ({ ytdlpDir: "", downloadsDir: "", ...read<Partial<AppSettings>>("settings", {}) });
export const patchSettings = (p: Partial<AppSettings>) => write("settings", { ...getSettings(), ...p });

// ---- tema ----
export function getThemeSettings(): ThemeSettings {
  const s = read<Partial<ThemeSettings>>("theme", {});
  return { ...DEFAULT_THEME, ...s, custom: { ...DEFAULT_THEME.custom, ...s.custom } };
}
export const setThemeSettings = (p: Partial<ThemeSettings>) => write("theme", { ...getThemeSettings(), ...p });
