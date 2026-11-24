import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Box, CssBaseline, IconButton, Tab, Tabs, ThemeProvider } from "@mui/material";
import { Settings } from "@mui/icons-material";
import { dirname, join } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import { engine, Track } from "./audio/AudioEngine";
import PlayerView from "./components/PlayerView";
import Library from "./components/Library";
import PlaylistView from "./components/PlaylistView";
import YtDlpView from "./components/YtDlpView";
import SettingsDialog from "./components/SettingsDialog";
import BottomPlayerBar from "./components/BottomPlayerBar";
import EqualizerDialog from "./components/EqualizerDialog";
import QueueDrawer from "./components/QueueDrawer";
import {
  addPlaylist,
  getPlaylists,
  getSettings,
  getThemeSettings,
  Playlist,
  refreshLibrary,
  useStoreVersion,
} from "./store";
import { buildTheme } from "./theme";
import { stem } from "./fs/library";

engine.setCrossfade(Number(localStorage.getItem("xfade") ?? 0)); // varsayılan 0

type TabId = "library" | "player" | "ytdlp";

export default function App() {
  const ver = useStoreVersion("theme", "settings");
  const theme = useMemo(() => buildTheme(getThemeSettings()), [ver]);

  useSyncExternalStore(
    f => engine.subscribe(f),
    () => (engine.track?.path ?? "") + engine.playing
  );

  const [tab, setTab] = useState<TabId>("library");
  const [openPl, setOpenPl] = useState<Playlist | null>(null);
  const [settings, setSettings] = useState(false);
  const [eqOpen, setEqOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  // Daha önce yt-dlp ile indirilip çıkış kodu 1 yüzünden eklenmemiş "Yeni playlist #1" varsa kütüphaneye ekle
  useEffect(() => {
    const s = getSettings();
    if (!s.downloadsDir) return;
    (async () => {
      try {
        const parent = await dirname(s.downloadsDir);
        const candidate = await join(parent, "Yeni playlist #1");
        if (await exists(candidate)) {
          const already = getPlaylists().some(
            p => p.path.toLowerCase() === candidate.toLowerCase()
          );
          if (!already) {
            addPlaylist(candidate);
            refreshLibrary();
          }
        }
      } catch {
        // yoksay
      }
    })();
  }, [ver]);

  const resolvePlaylistForTrack = (track: Track): Playlist => {
    if (openPl?.path === "__favorites__") {
      return openPl;
    }
    const dir = track.path.replace(/[\\/][^\\/]+$/, "");
    return (
      getPlaylists().find(p => p.path.toLowerCase() === dir.toLowerCase()) ?? {
        path: dir,
      }
    );
  };

  // Sol alttaki şarkıya tıklayınca playlistine git
  const handleOpenPlaylistForTrack = (track: Track) => {
    setOpenPl(resolvePlaylistForTrack(track));
    setTab("library");
  };

  // Oynatıcıdan playliste geri dön
  const handleBackToPlaylist = () => {
    if (engine.track) {
      handleOpenPlaylistForTrack(engine.track);
      return;
    }
    if (openPl) {
      setTab("library");
      return;
    }
    setTab("library");
  };

  // Sekme tıklamaları:
  // 1) Oynatıcıdan Kütüphane'ye geçince o anki şarkının playlistine atar;
  //    Playlist açıkken Kütüphane'ye bir daha basınca ana Kütüphane'ye döner;
  //    Ana Kütüphane'deyken bir şarkı çalıyorsa ve Kütüphane'ye basılırsa o şarkının playlistine gider.
  // 2) Playlist açıkken Oynatıcı'ya basınca oynatıcıya geçer; Oynatıcı açıkken Oynatıcı butonuna bir daha basınca playliste geri atar.
  const handleLibraryTabClick = () => {
    if (tab === "library") {
      if (openPl) {
        setOpenPl(null);
      } else if (engine.track) {
        setOpenPl(resolvePlaylistForTrack(engine.track));
      }
    } else if (tab === "player") {
      if (engine.track) {
        setOpenPl(resolvePlaylistForTrack(engine.track));
      }
      setTab("library");
    } else {
      setTab("library");
    }
  };

  const handlePlayerTabClick = () => {
    if (tab === "player") {
      handleBackToPlaylist();
    } else {
      setTab("player");
    }
  };

  // Klavye Kısayolları (Esc, Space, Ok Tuşları, M, S, R)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      if (e.code === "Escape") {
        // Açık bir diyalog / çekmece / menü varsa önce onun kapanmasına izin ver
        if (document.querySelector(".MuiModal-root")) return;
        if (tab === "player") {
          e.preventDefault();
          handleBackToPlaylist();
        } else if (tab === "library" && openPl) {
          e.preventDefault();
          setOpenPl(null);
        }
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        engine.toggle();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        engine.seek(engine.currentTime + 5);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        engine.seek(engine.currentTime - 5);
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        engine.setVolume(engine.volume + 0.05);
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        engine.setVolume(engine.volume - 0.05);
      } else if (e.code === "KeyM") {
        engine.toggleMute();
      } else if (e.code === "KeyS") {
        engine.toggleShuffle();
      } else if (e.code === "KeyR") {
        engine.cycleRepeat();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tab, openPl]);

  // Windows MediaSession / SMTC Entegrasyonu (Medya tuşları, kilit ekranı, Windows ses widgetı)
  useEffect(() => {
    try {
      if (!("mediaSession" in navigator)) return;
      const track = engine.track;
      if (track && typeof MediaMetadata !== "undefined") {
        const title = stem(track.name);
        const folder = track.path.split(/[\\/]/).slice(-2, -1)[0] ?? "Mocha Player";

        navigator.mediaSession.metadata = new MediaMetadata({
          title,
          artist: folder,
          album: "Mocha Player",
        });

        navigator.mediaSession.setActionHandler("play", () => engine.toggle());
        navigator.mediaSession.setActionHandler("pause", () => engine.toggle());
        navigator.mediaSession.setActionHandler("previoustrack", () => engine.prev());
        navigator.mediaSession.setActionHandler("nexttrack", () => engine.next());
        navigator.mediaSession.setActionHandler("seekto", d => {
          if (d.seekTime != null) engine.seek(d.seekTime);
        });
      }
    } catch (err) {
      console.warn("MediaSession error:", err);
    }
  }, [engine.track?.path, engine.playing]);

  const show = (t: TabId) => ({ display: tab === t ? "block" : "none", height: "100%" });

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        {/* Üst Sekmeler & Ayarlar */}
        <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={tab} sx={{ flex: 1 }}>
            <Tab
              value="library"
              label="Kütüphane"
              onClick={handleLibraryTabClick}
            />
            <Tab
              value="player"
              label="Oynatıcı"
              onClick={handlePlayerTabClick}
            />
            <Tab
              value="ytdlp"
              label="yt-dlp"
              onClick={() => setTab("ytdlp")}
            />
          </Tabs>
          <IconButton onClick={() => setSettings(true)} sx={{ mr: 1 }} title="Ayarlar">
            <Settings />
          </IconButton>
        </Box>

        {/* Ana İçerik Alanı */}
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <Box sx={show("library")}>
            {openPl ? (
              <PlaylistView
                playlist={openPl}
                onBack={() => setOpenPl(null)}
                onPlay={() => setTab("player")}
              />
            ) : (
              <Library onOpen={setOpenPl} />
            )}
          </Box>
          <Box sx={show("player")}>
            <PlayerView
              onBackToPlaylist={handleBackToPlaylist}
              onOpenEq={() => setEqOpen(true)}
              onOpenQueue={() => setQueueOpen(true)}
            />
          </Box>
          <Box sx={show("ytdlp")}>
            <YtDlpView onOpenSettings={() => setSettings(true)} />
          </Box>
        </Box>

        {/* Alt Kontrol Çubuğu: Yalnızca Oynatıcı (player) sekmesi DIŞINDA görünür */}
        {tab !== "player" && (
          <BottomPlayerBar
            onOpenPlaylist={handleOpenPlaylistForTrack}
            onOpenPlayer={() => setTab("player")}
            onOpenQueue={() => setQueueOpen(true)}
            onOpenEq={() => setEqOpen(true)}
          />
        )}

        {/* Ekolayzır Modalı */}
        <EqualizerDialog open={eqOpen} onClose={() => setEqOpen(false)} />

        {/* Çalma Sırası Çekmecesi */}
        <QueueDrawer open={queueOpen} onClose={() => setQueueOpen(false)} />

        {/* Ayarlar Modalı */}
        <SettingsDialog open={settings} onClose={() => setSettings(false)} />
      </Box>
    </ThemeProvider>
  );
}
