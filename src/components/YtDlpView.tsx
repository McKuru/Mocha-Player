import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add,
  AudioFile,
  CheckCircle,
  CreateNewFolder,
  Download,
  Folder,
  FolderOpen,
  LibraryMusic,
  Settings as SettingsIcon,
  WarningAmber,
} from "@mui/icons-material";
import { join } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import {
  classifyYoutube,
  createPlaylistFolder,
  downloadWithYtdlp,
  UrlKind,
} from "../ytdlp";
import {
  addPlaylist,
  displayName,
  getPlaylists,
  getSettings,
  patchSettings,
  Playlist,
  refreshLibrary,
  useStoreVersion,
} from "../store";
import { pickFolder } from "../fs/library";

interface Job {
  id: number;
  url: string;
  kind: UrlKind;
  targetName: string;
  status: "running" | "done" | "error";
  last: string;
}

const label = (k: UrlKind) => (k === "playlist" ? "Playlist" : "Şarkı");

/** Bir klasör yolunun üst dizinini (parent directory) döner. */
function getParentDir(p: string): string {
  const cleaned = p.replace(/[\\/]+$/, "");
  const idx = Math.max(cleaned.lastIndexOf("\\"), cleaned.lastIndexOf("/"));
  if (idx <= 0) return "";
  // Windows kök sürücüsü (örn. C:\) kontrolü
  if (idx === 2 && cleaned[1] === ":") return cleaned.slice(0, 3);
  return cleaned.slice(0, idx);
}

export default function YtDlpView({ onOpenSettings }: { onOpenSettings?: () => void }) {
  useStoreVersion("settings", "playlists");
  const s = getSettings();
  const playlists = getPlaylists();

  const [url, setUrl] = useState("");
  const [kindOverride, setKindOverride] = useState<UrlKind | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [ytFound, setYtFound] = useState<boolean | null>(null);
  const [ffmpegFound, setFfmpegFound] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState("");

  // İndirme öncesi açılan diyalog durumları
  const [pendingDownload, setPendingDownload] = useState<{
    url: string;
    kind: UrlKind;
  } | null>(null);
  const [createOnlyModal, setCreateOnlyModal] = useState(false);

  // Yeni playlist / boş klasör oluşturma alanları
  const [newPlName, setNewPlName] = useState("");
  const [parentDir, setParentDir] = useState<string>(() => {
    const saved = localStorage.getItem("default_parent_dir") ?? "";
    if (saved) return saved;
    const first = getPlaylists()[0]?.path;
    return first ? getParentDir(first) : "";
  });
  const [showNewFolderInSongDialog, setShowNewFolderInSongDialog] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  const counter = useRef(0);
  const parsed = url.trim() ? classifyYoutube(url) : null;
  const effectiveKind: UrlKind | null = parsed ? (kindOverride ?? parsed.kind) : null;

  useEffect(() => {
    setKindOverride(null);
  }, [url]);

  // Eğer parentDir henüz boşsa ve kütüphanede bir playlist varsa onun üst klasörünü varsayılan yap
  useEffect(() => {
    if (!parentDir && playlists.length > 0) {
      const derived = getParentDir(playlists[0].path);
      if (derived) {
        setParentDir(derived);
        localStorage.setItem("default_parent_dir", derived);
      }
    }
  }, [playlists, parentDir]);

  useEffect(() => {
    if (!s.ytdlpDir) {
      setYtFound(null);
      setFfmpegFound(false);
      return;
    }
    join(s.ytdlpDir, "yt-dlp.exe")
      .then(exists)
      .then(ok => setYtFound(ok))
      .catch(() => setYtFound(false));

    join(s.ytdlpDir, "ffmpeg.exe")
      .then(exists)
      .then(ok => setFfmpegFound(ok))
      .catch(() => setFfmpegFound(false));
  }, [s.ytdlpDir]);

  const patch = (id: number, p: Partial<Job>) =>
    setJobs(js => js.map(j => (j.id === id ? { ...j, ...p } : j)));

  const handlePickYtdlp = async () => {
    const dir = await pickFolder();
    if (!dir) return;
    const hasExe = await join(dir, "yt-dlp.exe").then(exists).catch(() => false);
    patchSettings({ ytdlpDir: dir });
    if (hasExe) {
      setStatusMsg("yt-dlp.exe başarıyla bulundu ve kaydedildi.");
    } else {
      setStatusMsg("Seçilen klasörde yt-dlp.exe bulunamadı! Lütfen doğru klasörü seçin.");
    }
  };

  const handlePickExistingPlaylistFolder = async () => {
    const dir = await pickFolder();
    if (!dir) return;
    addPlaylist(dir);
    refreshLibrary();
    const derived = getParentDir(dir);
    if (derived) {
      setParentDir(derived);
      localStorage.setItem("default_parent_dir", derived);
    }
    setStatusMsg(`"${dir.split(/[\\/]/).pop() ?? dir}" kütüphaneye eklendi.`);
  };

  const handlePickParentDir = async () => {
    const dir = await pickFolder();
    if (!dir) return;
    setParentDir(dir);
    localStorage.setItem("default_parent_dir", dir);
    setDialogError("");
  };

  const runDownloadJob = (
    targetUrl: string,
    kind: UrlKind,
    targetDir: string,
    targetName: string
  ) => {
    const id = ++counter.current;
    setJobs(js => [
      {
        id,
        url: targetUrl,
        kind,
        targetName,
        status: "running",
        last: `"${targetName}" içine indiriliyor…`,
      },
      ...js,
    ]);
    setUrl("");
    setKindOverride(null);
    setPendingDownload(null);

    downloadWithYtdlp(targetUrl, kind, targetDir, line => patch(id, { last: line }))
      .then(target => {
        patch(id, { status: "done", last: `Tamamlandı → ${target}` });
        addPlaylist(target, targetName);
        refreshLibrary();
      })
      .catch(e => patch(id, { status: "error", last: String(e) }));
  };

  // "İndir" butonuna basıldığında türüne göre ilgili seçim penceresini açar
  const handleStartClick = () => {
    if (!parsed || !effectiveKind) return;
    const targetUrl =
      parsed.hasBoth
        ? effectiveKind === "playlist"
          ? parsed.playlistUrl ?? parsed.url
          : parsed.videoUrl ?? parsed.url
        : parsed.url;

    setNewPlName("");
    setDialogError("");
    setShowNewFolderInSongDialog(playlists.length === 0);
    setPendingDownload({ url: targetUrl, kind: effectiveKind });
  };

  // Yeni boş klasör / playlist oluşturur ve oluşturulan Playlist nesnesini döner
  const createNewPlaylistOnDisk = async (): Promise<Playlist | null> => {
    const trimmed = newPlName.trim();
    if (!trimmed) {
      setDialogError("Lütfen yeni playlist için bir isim girin.");
      return null;
    }
    let baseDir = parentDir;
    if (!baseDir) {
      const picked = await pickFolder();
      if (!picked) {
        setDialogError("Lütfen yeni klasörün oluşturulacağı ana dizini seçin.");
        return null;
      }
      baseDir = picked;
      setParentDir(picked);
      localStorage.setItem("default_parent_dir", picked);
    }

    setCreatingFolder(true);
    setDialogError("");
    try {
      const createdPath = await createPlaylistFolder(baseDir, trimmed);
      addPlaylist(createdPath, trimmed);
      refreshLibrary();
      setNewPlName("");
      return { path: createdPath, name: trimmed };
    } catch (e) {
      setDialogError(String(e));
      return null;
    } finally {
      setCreatingFolder(false);
    }
  };

  const isConfigured = Boolean(s.ytdlpDir && ytFound);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, height: "100%", overflow: "auto", maxWidth: 760, mx: "auto" }}>
      {/* --- 1. yt-dlp Kurulum Uyarısı --- */}
      {!isConfigured && (
        <Card
          variant="outlined"
          sx={{
            mb: 2.5,
            borderColor: "warning.main",
            bgcolor: "action.hover",
            borderRadius: 3,
          }}
        >
          <CardContent sx={{ p: 2.5 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 1 }}>
              <WarningAmber color="warning" sx={{ fontSize: 28 }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                yt-dlp Kurulumu Gerekli
              </Typography>
            </Stack>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              YouTube'dan tekli şarkı ve playlist indirebilmek için sisteminizdeki <b>yt-dlp.exe</b>{" "}
              dosyasının bulunduğu klasörü seçmeniz gerekmektedir.
            </Typography>

            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                bgcolor: "background.paper",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 1,
              }}
            >
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  yt-dlp Klasörü (içinde yt-dlp.exe olmalı)
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  noWrap
                  sx={{ display: "block" }}
                >
                  {s.ytdlpDir || "Henüz seçilmedi"}
                </Typography>
                {s.ytdlpDir && ytFound !== null && (
                  <Chip
                    size="small"
                    sx={{ mt: 0.5 }}
                    icon={ytFound ? <CheckCircle /> : <WarningAmber />}
                    color={ytFound ? "success" : "error"}
                    label={ytFound ? "yt-dlp.exe hazır" : "Bu klasörde yt-dlp.exe yok"}
                  />
                )}
              </Box>
              <Button
                variant="outlined"
                size="small"
                startIcon={<FolderOpen />}
                onClick={handlePickYtdlp}
              >
                Klasör Seç
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* --- 2. Hiç Klasör / Playlist Yoksa Kullanıcıyı Uyar --- */}
      {playlists.length === 0 && (
        <Card
          variant="outlined"
          sx={{
            mb: 2.5,
            borderColor: "warning.main",
            bgcolor: "action.hover",
            borderRadius: 3,
          }}
        >
          <CardContent sx={{ p: 2.5 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 1 }}>
              <WarningAmber color="warning" sx={{ fontSize: 26 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Henüz Hiçbir Playlist Klasörü Seçilmedi
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Kütüphanenizde henüz hiçbir klasör yok. Şarkı veya playlist indirebilmek için lütfen
              bilgisayarınızdan bir müzik klasörü seçin ya da yeni bir boş klasör oluşturun.
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", gap: 1 }}>
              <Button
                variant="contained"
                size="small"
                startIcon={<FolderOpen />}
                onClick={handlePickExistingPlaylistFolder}
              >
                Bilgisayardan Klasör Seç
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<CreateNewFolder />}
                onClick={() => {
                  setNewPlName("");
                  setDialogError("");
                  setCreateOnlyModal(true);
                }}
              >
                Yeni Boş Klasör Oluştur
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {statusMsg && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setStatusMsg("")}>
          {statusMsg}
        </Alert>
      )}

      {/* --- İndirme Girdi Alanı --- */}
      <Box sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <TextField
            fullWidth
            size="small"
            placeholder="YouTube şarkı veya playlist bağlantısını yapıştırın (https://...)"
            value={url}
            disabled={!isConfigured}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && parsed && isConfigured) handleStartClick();
            }}
            slotProps={{ input: { sx: { userSelect: "text" } } }}
          />
          <Button
            variant="contained"
            startIcon={<Download />}
            disabled={!parsed || !isConfigured}
            onClick={handleStartClick}
            sx={{ px: 3, minWidth: 100 }}
          >
            İndir
          </Button>

          {onOpenSettings && (
            <Tooltip title="Ayarlar">
              <IconButton onClick={onOpenSettings}>
                <SettingsIcon />
              </IconButton>
            </Tooltip>
          )}
        </Stack>

        <Box sx={{ mt: 1, minHeight: 28, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          {isConfigured && (
            <Chip
              size="small"
              variant="outlined"
              icon={<AudioFile />}
              label={
                ffmpegFound
                  ? "Format: MP3 (Yalnızca Ses • En Yüksek Kalite)"
                  : "Format: M4A (Yalnızca Ses)"
              }
            />
          )}

          {url.trim() &&
            (parsed ? (
              parsed.hasBoth ? (
                <>
                  <Chip
                    size="small"
                    color={effectiveKind === "playlist" ? "primary" : "default"}
                    variant={effectiveKind === "playlist" ? "filled" : "outlined"}
                    label="Playlist Olarak İndir"
                    onClick={() => setKindOverride("playlist")}
                    sx={{ cursor: "pointer" }}
                  />
                  <Chip
                    size="small"
                    color={effectiveKind === "video" ? "primary" : "default"}
                    variant={effectiveKind === "video" ? "filled" : "outlined"}
                    label="Sadece Bu Şarkıyı İndir"
                    onClick={() => setKindOverride("video")}
                    sx={{ cursor: "pointer" }}
                  />
                </>
              ) : (
                <Chip size="small" color="primary" label={`${label(effectiveKind!)} algılandı`} />
              )
            ) : (
              <Chip
                size="small"
                color="error"
                label="Geçerli bir YouTube bağlantısı girin (youtube.com veya youtu.be)"
              />
            ))}
        </Box>
      </Box>

      {/* --- Açıklayıcı Bilgi --- */}
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
        💡 Video indirilmez; yalnızca en yüksek kaliteli ses akışı çekilerek <b>.mp3</b> müzik dosyası
        olarak kaydedilir. Tekli şarkılarda <b>hangi playliste ekleneceği</b>, playlist indirmelerinde
        ise <b>yeni playlistin ismi</b> sorulur.
      </Typography>

      {/* --- İndirme Görevleri Listesi --- */}
      <Stack spacing={1.5}>
        {jobs.map(j => (
          <Box
            key={j.id}
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: "action.hover",
              border: 1,
              borderColor: "divider",
            }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5, flexWrap: "wrap" }}>
              <Chip size="small" label={label(j.kind)} />
              <Chip
                size="small"
                icon={<LibraryMusic />}
                variant="outlined"
                label={j.targetName}
              />
              <Chip
                size="small"
                variant="outlined"
                color={
                  j.status === "error"
                    ? "error"
                    : j.status === "done"
                    ? "success"
                    : "primary"
                }
                label={
                  j.status === "running"
                    ? "İndiriliyor..."
                    : j.status === "done"
                    ? "Tamamlandı"
                    : "Hata"
                }
              />
              <Typography
                variant="caption"
                noWrap
                color="text.secondary"
                sx={{ flex: 1, fontFamily: "monospace" }}
              >
                {j.url}
              </Typography>
            </Stack>
            <Typography
              variant="caption"
              sx={{
                fontFamily: "monospace",
                display: "block",
                wordBreak: "break-all",
                color: j.status === "error" ? "error.main" : "text.primary",
              }}
            >
              {j.last}
            </Typography>
          </Box>
        ))}
      </Stack>

      {/* ===================================================================== */}
      {/* DİYALOG 1: PLAYLIST İNDİRİRKEN YENİ PLAYLİST İSMİ SORMA               */}
      {/* ===================================================================== */}
      <Dialog
        open={pendingDownload?.kind === "playlist"}
        onClose={() => setPendingDownload(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Yeni Playlist İçin İsim Girin</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              İndirilecek YouTube playlisti için yeni bir klasör oluşturulacak ve kütüphanenize
              eklenecektir.
            </Typography>

            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Yeni Playlist İsmi"
              placeholder="Örn: Gece Sürüşü, Favori Mix…"
              value={newPlName}
              onChange={e => {
                setNewPlName(e.target.value);
                setDialogError("");
              }}
              onKeyDown={async e => {
                if (e.key === "Enter" && pendingDownload) {
                  const pl = await createNewPlaylistOnDisk();
                  if (pl) {
                    runDownloadJob(pendingDownload.url, "playlist", pl.path, displayName(pl));
                  }
                }
              }}
              slotProps={{ input: { sx: { userSelect: "text" } } }}
            />

            <Box
              sx={{
                p: 1.2,
                borderRadius: 2,
                bgcolor: "action.hover",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
              }}
            >
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  Oluşturulacağı Ana Klasör:
                </Typography>
                <Typography variant="caption" noWrap sx={{ fontWeight: 600, display: "block" }}>
                  {parentDir || "Seçilmedi (Lütfen klasör seçin)"}
                </Typography>
              </Box>
              <Button size="small" variant="outlined" onClick={handlePickParentDir}>
                {parentDir ? "Değiştir" : "Klasör Seç"}
              </Button>
            </Box>

            {dialogError && <Alert severity="error">{dialogError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDownload(null)}>İptal</Button>
          <Button
            variant="contained"
            disabled={creatingFolder || !newPlName.trim()}
            onClick={async () => {
              if (!pendingDownload) return;
              const pl = await createNewPlaylistOnDisk();
              if (pl) {
                runDownloadJob(pendingDownload.url, "playlist", pl.path, displayName(pl));
              }
            }}
          >
            Oluştur ve İndir
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===================================================================== */}
      {/* DİYALOG 2: TEKLİ ŞARKI İNDİRİRKEN HANGİ PLAYLİSTE EKLENECEĞİNİ SORMA  */}
      {/* ===================================================================== */}
      <Dialog
        open={pendingDownload?.kind === "video"}
        onClose={() => setPendingDownload(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Şarkı Hangi Playliste Eklensin?</DialogTitle>
        <DialogContent dividers>
          {playlists.length === 0 ? (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Henüz kütüphanenizde hiçbir playlist klasörü yok. Aşağıdan yeni bir boş klasör
              oluşturabilir veya bilgisayarınızdan mevcut bir klasör seçebilirsiniz.
            </Alert>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                İndirilecek şarkının kaydedileceği playlisti seçin:
              </Typography>
              <List
                dense
                 sx={{
                  maxHeight: 260,
                  overflow: "auto",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 2,
                  mb: 2,
                }}
              >
                {playlists.map(p => (
                  <ListItemButton
                    key={p.path}
                    onClick={() => {
                      if (!pendingDownload) return;
                      runDownloadJob(pendingDownload.url, "video", p.path, displayName(p));
                    }}
                  >
                    <ListItemAvatar sx={{ minWidth: 36 }}>
                      <Folder color="primary" fontSize="small" />
                    </ListItemAvatar>
                    <ListItemText
                      primary={displayName(p)}
                      secondary={p.path}
                      slotProps={{
                        primary: { sx: { fontWeight: 600 } },
                        secondary: { noWrap: true, sx: { fontSize: 11 } },
                      }}
                    />
                  </ListItemButton>
                ))}
              </List>
            </>
          )}

          <Divider sx={{ my: 1.5 }} />

          {/* Yeni Boş Klasör Oluşturma Seçeneği */}
          {!showNewFolderInSongDialog ? (
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<CreateNewFolder />}
                onClick={() => {
                  setDialogError("");
                  setShowNewFolderInSongDialog(true);
                }}
              >
                Yeni Boş Klasör / Playlist Oluştur
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<FolderOpen />}
                onClick={async () => {
                  const dir = await pickFolder();
                  if (!dir || !pendingDownload) return;
                  addPlaylist(dir);
                  refreshLibrary();
                  const name = dir.split(/[\\/]/).pop() ?? dir;
                  runDownloadJob(pendingDownload.url, "video", dir, name);
                }}
              >
                Bilgisayardan Klasör Seç ve İndir
              </Button>
            </Stack>
          ) : (
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: "action.hover" }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Yeni Boş Klasör / Playlist Oluştur
              </Typography>
              <Stack spacing={1.5}>
                <TextField
                  autoFocus
                  fullWidth
                  size="small"
                  label="Yeni Klasör / Playlist İsmi"
                  placeholder="Örn: Yeni Şarkılarım"
                  value={newPlName}
                  onChange={e => {
                    setNewPlName(e.target.value);
                    setDialogError("");
                  }}
                  slotProps={{ input: { sx: { userSelect: "text" } } }}
                />

                <Stack
                  direction="row"
                   sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}
                >
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>
                    Konum: <b>{parentDir || "Seçilmedi"}</b>
                  </Typography>
                  <Button size="small" onClick={handlePickParentDir}>
                    {parentDir ? "Konumu Değiştir" : "Üst Klasör Seç"}
                  </Button>
                </Stack>

                {dialogError && <Alert severity="error">{dialogError}</Alert>}

                <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
                  {playlists.length > 0 && (
                    <Button size="small" onClick={() => setShowNewFolderInSongDialog(false)}>
                      Vazgeç
                    </Button>
                  )}
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<Add />}
                    disabled={creatingFolder || !newPlName.trim()}
                    onClick={async () => {
                      const pl = await createNewPlaylistOnDisk();
                      if (pl) {
                        setShowNewFolderInSongDialog(false);
                      }
                    }}
                  >
                    Sadece Boş Klasör Oluştur
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<Download />}
                    disabled={creatingFolder || !newPlName.trim()}
                    onClick={async () => {
                      if (!pendingDownload) return;
                      const pl = await createNewPlaylistOnDisk();
                      if (pl) {
                        runDownloadJob(pendingDownload.url, "video", pl.path, displayName(pl));
                      }
                    }}
                  >
                    Oluştur ve Şarkıyı İndir
                  </Button>
                </Stack>
              </Stack>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDownload(null)}>İptal</Button>
        </DialogActions>
      </Dialog>

      {/* ===================================================================== */}
      {/* DİYALOG 3: BAĞIMSIZ YENİ BOŞ KLASÖR OLUŞTURMA                         */}
      {/* ===================================================================== */}
      <Dialog
        open={createOnlyModal}
        onClose={() => setCreateOnlyModal(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Yeni Boş Playlist Klasörü Oluştur</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Klasör / Playlist İsmi"
              placeholder="Örn: Favorilerim"
              value={newPlName}
              onChange={e => {
                setNewPlName(e.target.value);
                setDialogError("");
              }}
              slotProps={{ input: { sx: { userSelect: "text" } } }}
            />
            <Box
              sx={{
                p: 1.2,
                borderRadius: 2,
                bgcolor: "action.hover",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
              }}
            >
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  Oluşturulacağı Ana Klasör:
                </Typography>
                <Typography variant="caption" noWrap sx={{ fontWeight: 600, display: "block" }}>
                  {parentDir || "Seçilmedi (Lütfen klasör seçin)"}
                </Typography>
              </Box>
              <Button size="small" variant="outlined" onClick={handlePickParentDir}>
                {parentDir ? "Değiştir" : "Klasör Seç"}
              </Button>
            </Box>
            {dialogError && <Alert severity="error">{dialogError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOnlyModal(false)}>İptal</Button>
          <Button
            variant="contained"
            disabled={creatingFolder || !newPlName.trim()}
            onClick={async () => {
              const pl = await createNewPlaylistOnDisk();
              if (pl) {
                setCreateOnlyModal(false);
                setStatusMsg(`"${displayName(pl)}" klasörü oluşturuldu ve kütüphaneye eklendi.`);
              }
            }}
          >
            Oluştur
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
