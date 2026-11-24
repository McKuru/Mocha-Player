import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  ArrowBack,
  Clear,
  Favorite,
  FavoriteBorder,
  Folder,
  MoreVert,
  PlayArrow,
  QueueMusic,
  Search,
  Shuffle,
  SortByAlpha,
} from "@mui/icons-material";
import { engine, Track } from "../audio/AudioEngine";
import { chooseCover, listTracks, stem } from "../fs/library";
import { cleanQuery, fetchAndSetCover } from "../net/coverFetch";
import {
  displayName,
  folderName,
  getCoverOverride,
  getFavorites,
  isFavorite,
  Playlist,
  playlistKey,
  toggleFavorite,
  trackKey,
  useStoreVersion,
} from "../store";
import { useCoverUrl } from "../useCover";
import CoverPickerDialog, { CoverPickerTarget } from "./CoverPickerDialog";

function Thumb({ path }: { path: string }) {
  const url = useCoverUrl("track", path);
  return (
    <Box
      sx={{
        width: 44,
        height: 44,
        borderRadius: 1.5,
        bgcolor: "action.hover",
        mr: 1.5,
        backgroundImage: url ? `url(${url})` : "none",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    />
  );
}

export default function PlaylistView({
  playlist,
  onBack,
}: {
  playlist: Playlist;
  onBack: () => void;
  onPlay?: () => void;
}) {
  const ver = useStoreVersion("library", "favorites");
  useStoreVersion("playlists");
  useSyncExternalStore(
    f => engine.subscribe(f),
    () => (engine.track?.path ?? "") + engine.playing
  );

  const isFav = playlist.path === "__favorites__";
  const [tracks, setTracks] = useState<Track[]>([]);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<"default" | "asc" | "desc">("default");
  const [menu, setMenu] = useState<{ el: HTMLElement; track?: Track } | null>(null);
  const [msg, setMsg] = useState("");
  const [coverTarget, setCoverTarget] = useState<CoverPickerTarget | null>(null);

  const playlistCoverUrl = useCoverUrl("playlist", isFav ? undefined : playlist.path);

  useEffect(() => {
    if (isFav) {
      const favPaths = getFavorites();
      const favTracks: Track[] = favPaths.map(p => ({
        path: p,
        name: p.split(/[\\/]/).pop() ?? p,
      }));
      setTracks(favTracks);
    } else {
      listTracks(playlist.path)
        .then(setTracks)
        .catch(() => setTracks([]));
    }
  }, [playlist.path, isFav, ver]);

  const filteredTracks = useMemo(() => {
    let list = [...tracks];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => stem(t.name).toLowerCase().includes(q));
    }
    if (sortMode === "asc") {
      list.sort((a, b) => stem(a.name).localeCompare(stem(b.name), "tr", { numeric: true }));
    } else if (sortMode === "desc") {
      list.sort((a, b) => stem(b.name).localeCompare(stem(a.name), "tr", { numeric: true }));
    }
    return list;
  }, [tracks, search, sortMode]);

  const play = (indexInFiltered: number) => {
    engine.setQueue(filteredTracks, indexInFiltered);
  };

  const openTrackCoverPicker = (t: Track) => {
    setCoverTarget({
      key: trackKey(t.path),
      query: cleanQuery(t.name) || stem(t.name),
      kind: "track",
      label: stem(t.name),
    });
  };

  const fetchOneAlternative = async (t: Track) => {
    setMsg("Alternatif kapak aranıyor…");
    const ok = await fetchAndSetCover(trackKey(t.path), cleanQuery(t.name) || stem(t.name), "track", true);
    setMsg(ok ? "Alternatif kapak uygulandı" : "Alternatif kapak bulunamadı");
  };

  const fetchAll = async (forceAlternative: boolean) => {
    let found = 0;
    let i = 0;
    for (const t of tracks) {
      i++;
      if (!forceAlternative && getCoverOverride(trackKey(t.path))) continue;
      setMsg(`Kapaklar aranıyor… ${i}/${tracks.length}`);
      const q = cleanQuery(t.name) || stem(t.name);
      if (await fetchAndSetCover(trackKey(t.path), q, "track", forceAlternative)) {
        found++;
      }
      // API hız sınırına takılmamak için kısa bekleme
      await new Promise(r => setTimeout(r, 200));
    }
    setMsg(`${found} şarkı kapağı güncellendi`);
  };

  const title = isFav ? "Beğenilen Şarkılar" : displayName(playlist);

  const openPlaylistCoverPicker = () => {
    if (isFav) return;
    setCoverTarget({
      key: playlistKey(playlist.path),
      query: title,
      kind: "album",
      label: `Playlist: ${title}`,
    });
  };

  return (
    <Box sx={{ height: "100%", overflow: "auto", p: { xs: 2, sm: 3 } }}>
      {/* Üst Geri Butonu */}
      <Box sx={{ mb: 2 }}>
        <Button startIcon={<ArrowBack />} onClick={onBack} size="small" sx={{ color: "text.secondary" }}>
          Kütüphaneye Dön
        </Button>
      </Box>

      {/* --- YouTube Music Tarzı Başlık Alanı (Büyük Kapak + Başlık) --- */}
      <Box
        sx={{
          display: "flex",
          gap: 3,
          alignItems: { xs: "center", sm: "flex-end" },
          flexDirection: { xs: "column", sm: "row" },
          mb: 3,
        }}
      >
        <Box
          onClick={openPlaylistCoverPicker}
          title={isFav ? undefined : "Playlist kapağını seç / değiştir"}
          sx={{
            width: { xs: 160, sm: 200 },
            height: { xs: 160, sm: 200 },
            minWidth: { xs: 160, sm: 200 },
            borderRadius: 4,
            bgcolor: isFav ? "primary.main" : "action.hover",
            backgroundImage: playlistCoverUrl ? `url(${playlistCoverUrl})` : "none",
            backgroundSize: "cover",
            backgroundPosition: "center",
            boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
            display: "grid",
            placeItems: "center",
            cursor: isFav ? "default" : "pointer",
            transition: "transform 0.2s ease",
            "&:hover": { transform: isFav ? "none" : "scale(1.02)" },
          }}
        >
          {isFav ? (
            <Favorite sx={{ fontSize: 72, color: "primary.contrastText" }} />
          ) : !playlistCoverUrl ? (
            <Folder sx={{ fontSize: 72, color: "text.disabled" }} />
          ) : null}
        </Box>

        <Box sx={{ flex: 1, textAlign: { xs: "center", sm: "left" } }}>
          <Typography variant="overline" color="primary.main" sx={{ fontWeight: 700, letterSpacing: 1.5 }}>
            {isFav ? "ÖZEL LİSTE" : "ÇALMA LİSTESİ"}
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, wordBreak: "break-word" }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {tracks.length} parça
          </Typography>

          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: "center", justifyContent: { xs: "center", sm: "flex-start" }, flexWrap: "wrap", gap: 1 }}
          >
            <Button
              variant="contained"
              startIcon={<PlayArrow />}
              onClick={() => play(0)}
              disabled={tracks.length === 0}
              sx={{ borderRadius: 6, px: 3, py: 1 }}
            >
              Tümünü Çal
            </Button>
            <Button
              variant="outlined"
              startIcon={<Shuffle />}
              onClick={() => {
                if (tracks.length === 0) return;
                if (!engine.shuffle) engine.toggleShuffle();
                const randomIdx = Math.floor(Math.random() * tracks.length);
                play(randomIdx);
              }}
              disabled={tracks.length === 0}
              sx={{ borderRadius: 6, px: 2.5, py: 1 }}
            >
              Karışık
            </Button>

            {!isFav && (
              <IconButton onClick={e => setMenu({ el: e.currentTarget })}>
                <MoreVert />
              </IconButton>
            )}
          </Stack>
        </Box>
      </Box>

      {/* --- Arama & Sıralama Çubuğu --- */}
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 2 }}>
        <TextField
          size="small"
          placeholder="Bu listede ara…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          sx={{ flex: 1, maxWidth: 360 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearch("")}>
                    <Clear fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
              sx: { borderRadius: 3, userSelect: "text" },
            },
          }}
        />

        <Tooltip title={sortMode === "asc" ? "Sıralama: A-Z" : sortMode === "desc" ? "Sıralama: Z-A" : "Sıralama: Standart"}>
          <Button
            size="small"
            variant={sortMode !== "default" ? "contained" : "outlined"}
            startIcon={<SortByAlpha />}
            onClick={() => setSortMode(m => (m === "default" ? "asc" : m === "asc" ? "desc" : "default"))}
            sx={{ borderRadius: 3, textTransform: "none" }}
          >
            {sortMode === "asc" ? "A-Z" : sortMode === "desc" ? "Z-A" : "Sırala"}
          </Button>
        </Tooltip>
      </Stack>

      {/* --- Şarkı Listesi --- */}
      <List dense disablePadding>
        {filteredTracks.map((t, i) => {
          const isPlayingThis = engine.track?.path === t.path;
          const liked = isFavorite(t.path);

          return (
            <ListItem
              key={t.path}
              disablePadding
              secondaryAction={
                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                  <IconButton size="small" onClick={() => toggleFavorite(t.path)} sx={{ color: liked ? "error.main" : "text.secondary" }}>
                    {liked ? <Favorite fontSize="small" /> : <FavoriteBorder fontSize="small" />}
                  </IconButton>
                  <IconButton edge="end" onClick={e => setMenu({ el: e.currentTarget, track: t })}>
                    <MoreVert fontSize="small" />
                  </IconButton>
                </Stack>
              }
              sx={{ mb: 0.5 }}
            >
              <ListItemButton
                onClick={() => play(i)}
                sx={{
                  borderRadius: 2,
                  bgcolor: isPlayingThis ? "action.selected" : "transparent",
                  pr: 8,
                }}
              >
                <ListItemAvatar sx={{ minWidth: 0 }}>
                  <Thumb path={t.path} />
                </ListItemAvatar>
                <ListItemText
                  primary={stem(t.name)}
                  secondary={isFav ? folderName(t.path) : undefined}
                  slotProps={{
                    primary: {
                      noWrap: true,
                      sx: {
                        fontWeight: isPlayingThis ? 700 : 500,
                        color: isPlayingThis ? "primary.main" : "text.primary",
                      },
                    },
                    secondary: { noWrap: true, sx: { fontSize: 11 } },
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      {filteredTracks.length === 0 && (
        <Typography color="text.secondary" sx={{ textAlign: "center", mt: 4 }}>
          {search ? "Aramayla eşleşen parça bulunamadı." : "Bu listede ses dosyası yok."}
        </Typography>
      )}

      {/* Menü */}
      <Menu open={!!menu} anchorEl={menu?.el} onClose={() => setMenu(null)}>
        {menu?.track ? [
          <MenuItem
            key="queue"
            onClick={() => {
              const t = menu.track!;
              setMenu(null);
              engine.addToQueue(t);
              setMsg("Kuyruğa eklendi");
            }}
          >
            <QueueMusic fontSize="small" sx={{ mr: 1.5 }} /> Sıraya Ekle
          </MenuItem>,
          <MenuItem
            key="pick-online"
            onClick={() => {
              const t = menu.track!;
              setMenu(null);
              openTrackCoverPicker(t);
            }}
          >
            İnternetten Kapak Seç / Değiştir…
          </MenuItem>,
          <MenuItem
            key="alt-online"
            onClick={() => {
              const t = menu.track!;
              setMenu(null);
              fetchOneAlternative(t);
            }}
          >
            Hızlı Alternatif Kapak Dene
          </MenuItem>,
          <MenuItem
            key="cover"
            onClick={() => {
              const t = menu.track!;
              setMenu(null);
              chooseCover(trackKey(t.path));
            }}
          >
            Bilgisayardan Kapak Seç…
          </MenuItem>,
        ] : [
          <MenuItem
            key="pl-online"
            onClick={() => {
              setMenu(null);
              openPlaylistCoverPicker();
            }}
          >
            Playlist kapağını internetten seç…
          </MenuItem>,
          <MenuItem
            key="pl-local"
            onClick={() => {
              setMenu(null);
              chooseCover(playlistKey(playlist.path));
            }}
          >
            Playlist kapağını dosyadan seç…
          </MenuItem>,
          <MenuItem
            key="missing"
            onClick={() => {
              setMenu(null);
              fetchAll(false);
            }}
          >
            Eksik şarkı kapaklarını otomatik bul
          </MenuItem>,
          <MenuItem
            key="refresh-all"
            onClick={() => {
              setMenu(null);
              fetchAll(true);
            }}
          >
            Tüm şarkı kapaklarını alternatiflerle yenile
          </MenuItem>,
        ]}
      </Menu>

      {/* Görsel Kapak Seçici Diyaloğu */}
      <CoverPickerDialog
        target={coverTarget}
        onClose={() => setCoverTarget(null)}
        onStatus={m => setMsg(m)}
      />

      <Snackbar open={!!msg} autoHideDuration={3000} onClose={() => setMsg("")} message={msg} />
    </Box>
  );
}
