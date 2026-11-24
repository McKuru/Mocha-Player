import { useMemo, useState } from "react";
import {
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Add, Clear, Favorite, Folder, MoreVert, Search } from "@mui/icons-material";
import {
  addPlaylist,
  displayName,
  getFavorites,
  getPlaylists,
  playlistKey,
  removePlaylist,
  renamePlaylist,
  Playlist,
  useStoreVersion,
} from "../store";
import { chooseCover, pickFolder } from "../fs/library";
import { fetchAndSetCover } from "../net/coverFetch";
import { useCoverUrl } from "../useCover";
import CoverPickerDialog, { CoverPickerTarget } from "./CoverPickerDialog";

function Card({
  p,
  onOpen,
  onMenu,
}: {
  p: Playlist;
  onOpen: () => void;
  onMenu: (el: HTMLElement) => void;
}) {
  const url = useCoverUrl("playlist", p.path);
  return (
    <Box
      sx={{
        position: "relative",
        aspectRatio: "1",
        borderRadius: 3,
        overflow: "hidden",
        bgcolor: "action.hover",
        boxShadow: 3,
        transition: "transform 0.15s ease",
        "&:hover": { transform: "scale(1.02)" },
      }}
    >
      <ButtonBase
        onClick={onOpen}
        sx={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-end",
          backgroundImage: url ? `url(${url})` : "none",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {!url && (
          <Folder
            sx={{
              position: "absolute",
              top: "40%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              fontSize: 56,
              color: "text.disabled",
            }}
          />
        )}
        <Box
          sx={{
            width: "100%",
            p: 1.2,
            textAlign: "left",
            background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
          }}
        >
          <Typography noWrap sx={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>
            {displayName(p)}
          </Typography>
        </Box>
      </ButtonBase>
      <IconButton
        size="small"
        onClick={e => onMenu(e.currentTarget)}
        sx={{
          position: "absolute",
          top: 6,
          right: 6,
          bgcolor: "rgba(0,0,0,0.5)",
          color: "#fff",
          "&:hover": { bgcolor: "rgba(0,0,0,0.7)" },
        }}
      >
        <MoreVert fontSize="small" />
      </IconButton>
    </Box>
  );
}

export default function Library({ onOpen }: { onOpen: (p: Playlist) => void }) {
  useStoreVersion("playlists", "settings", "favorites");
  const playlists = getPlaylists();
  const favCount = getFavorites().length;

  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState<{ el: HTMLElement; p: Playlist } | null>(null);
  const [renaming, setRenaming] = useState<Playlist | null>(null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [coverTarget, setCoverTarget] = useState<CoverPickerTarget | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return playlists;
    const q = search.toLowerCase();
    return playlists.filter(p => displayName(p).toLowerCase().includes(q));
  }, [playlists, search]);

  const add = async () => {
    const d = await pickFolder();
    if (d) addPlaylist(d);
  };

  const act = async (fn: (p: Playlist) => Promise<void> | void) => {
    const p = menu!.p;
    setMenu(null);
    await fn(p);
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, height: "100%", overflow: "auto" }}>
      {/* Üst Arama & Klasör Ekle Butonu */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 2.5, alignItems: "center" }}>
        <TextField
          size="small"
          placeholder="Playlist ara…"
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
        <Button variant="outlined" startIcon={<Add />} onClick={add} sx={{ borderRadius: 3, textTransform: "none" }}>
          Klasör Ekle
        </Button>
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 2.5,
        }}
      >
        {/* Sabit "Beğenilen Şarkılar" Özel Kartı */}
        <Box
          sx={{
            position: "relative",
            aspectRatio: "1",
            borderRadius: 3,
            overflow: "hidden",
            background: "linear-gradient(135deg, #cba6f7 0%, #f38ba8 100%)",
            boxShadow: 4,
            cursor: "pointer",
            transition: "transform 0.15s ease",
            "&:hover": { transform: "scale(1.02)" },
          }}
          onClick={() => onOpen({ path: "__favorites__", name: "Beğenilen Şarkılar" })}
        >
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              p: 2,
            }}
          >
            <Favorite sx={{ fontSize: 44, color: "#1e1e2e" }} />
            <Box>
              <Typography sx={{ color: "#1e1e2e", fontWeight: 700, fontSize: 16 }}>
                Beğenilen Şarkılar
              </Typography>
              <Typography sx={{ color: "#1e1e2e", opacity: 0.85, fontSize: 12 }}>
                {favCount} parça
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Normal Playlistler */}
        {filtered.map(p => (
          <Card key={p.path} p={p} onOpen={() => onOpen(p)} onMenu={el => setMenu({ el, p })} />
        ))}
      </Box>

      {filtered.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 4, textAlign: "center" }}>
          {search ? "Aramayla eşleşen playlist bulunamadı." : "Henüz bir klasör eklemedin."}
        </Typography>
      )}

      {/* Menü */}
      <Menu open={!!menu} anchorEl={menu?.el} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => act(p => { setText(displayName(p)); setRenaming(p); })}>
          Yeniden adlandır
        </MenuItem>
        <MenuItem
          onClick={() =>
            act(p => {
              const name = displayName(p);
              setCoverTarget({
                key: playlistKey(p.path),
                query: name,
                kind: "album",
                label: `Playlist: ${name}`,
              });
            })
          }
        >
          İnternetten kapak seç…
        </MenuItem>
        <MenuItem
          onClick={() =>
            act(async p => {
              setMsg("Alternatif kapak aranıyor…");
              const ok = await fetchAndSetCover(playlistKey(p.path), displayName(p), "album", true);
              setMsg(ok ? "Alternatif kapak uygulandı" : "Alternatif kapak bulunamadı");
            })
          }
        >
          Hızlı alternatif kapak dene
        </MenuItem>
        <MenuItem onClick={() => act(p => chooseCover(playlistKey(p.path)).then(() => {}))}>
          Dosyadan kapak seç…
        </MenuItem>
        <MenuItem onClick={() => act(p => removePlaylist(p.path))}>Listeden kaldır</MenuItem>
      </Menu>

      {/* Görsel Kapak Seçici Diyaloğu */}
      <CoverPickerDialog
        target={coverTarget}
        onClose={() => setCoverTarget(null)}
        onStatus={m => setMsg(m)}
      />

      {/* Yeniden Adlandır Diyaloğu */}
      <Dialog open={!!renaming} onClose={() => setRenaming(null)} fullWidth maxWidth="xs">
        <DialogTitle>Playlist Adı</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                renamePlaylist(renaming!.path, text);
                setRenaming(null);
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenaming(null)}>İptal</Button>
          <Button
            onClick={() => {
              renamePlaylist(renaming!.path, text);
              setRenaming(null);
            }}
          >
            Kaydet
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!msg} autoHideDuration={3000} onClose={() => setMsg("")} message={msg} />
    </Box>
  );
}
