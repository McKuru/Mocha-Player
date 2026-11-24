import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Snackbar,
  Slider,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Favorite,
  FavoriteBorder,
  Image as ImageIcon,
  ImageSearch,
  KeyboardArrowDown,
  Lyrics as LyricsIcon,
  Pause,
  PlayArrow,
  QueueMusic,
  Repeat,
  RepeatOne,
  Shuffle,
  SkipNext,
  SkipPrevious,
  Tune,
  VolumeDown,
  VolumeMute,
  VolumeOff,
  VolumeUp,
} from "@mui/icons-material";
import { engine } from "../audio/AudioEngine";
import { folderName, isFavorite, toggleFavorite, trackKey, useStoreVersion } from "../store";
import { useCoverUrl } from "../useCover";
import AudioVisualizer from "./AudioVisualizer";
import { fetchLyrics, LyricsData } from "../net/lyrics";
import { cleanQuery } from "../net/coverFetch";
import CoverPickerDialog, { CoverPickerTarget } from "./CoverPickerDialog";

const fmt = (s: number) => {
  if (isNaN(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

function useEngine() {
  useSyncExternalStore(
    f => engine.subscribe(f),
    () =>
      (engine.track?.path ?? "") +
      String(engine.playing) +
      engine.shuffle +
      engine.repeat +
      engine.volume
  );
  return engine;
}

export default function PlayerView({
  onBackToPlaylist,
  onOpenEq,
  onOpenQueue,
}: {
  onBackToPlaylist: () => void;
  onOpenEq: () => void;
  onOpenQueue: () => void;
}) {
  const e = useEngine();
  useStoreVersion("favorites");

  const [time, setTime] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const [showRemaining, setShowRemaining] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsData, setLyricsData] = useState<LyricsData | null>(null);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [coverTarget, setCoverTarget] = useState<CoverPickerTarget | null>(null);
  const [msg, setMsg] = useState("");

  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);

  const path = e.track?.path;
  const cover = useCoverUrl("track", path);
  const liked = path ? isFavorite(path) : false;

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setTime(engine.currentTime);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Şarkı değiştiğinde sözleri otomatik çek
  useEffect(() => {
    if (!e.track) {
      setLyricsData(null);
      return;
    }
    setLoadingLyrics(true);
    fetchLyrics(e.track.name)
      .then(res => {
        setLyricsData(res);
        setLoadingLyrics(false);
      })
      .catch(() => setLoadingLyrics(false));
  }, [e.track?.path]);

  // Senkronize sözlerde aktif satırı takip et ve kaydır
  useEffect(() => {
    if (!showLyrics || !lyricsData?.synced) return;
    const activeEl = lyricsContainerRef.current?.querySelector(".active-lyric");
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [time, showLyrics, lyricsData]);

  const title = e.track?.name.replace(/\.[^.]+$/, "") ?? "Çalan şarkı yok";
  const folder = path ? path.split(/[\\/]/).slice(-2, -1)[0] ?? folderName(path) : "—";
  const shown = drag ?? time;
  const duration = e.duration || 0;
  const Rep = e.repeat === "one" ? RepeatOne : Repeat;
  const vol = e.volume;

  const VolIcon =
    vol === 0 ? VolumeOff : vol < 0.3 ? VolumeMute : vol < 0.7 ? VolumeDown : VolumeUp;

  const openCurrentTrackCoverPicker = () => {
    if (!e.track) return;
    setCoverTarget({
      key: trackKey(e.track.path),
      query: cleanQuery(e.track.name) || title,
      kind: "track",
      label: title,
    });
  };

  // Aktif şarkı sözü satırı indexi
  let activeLyricIdx = -1;
  if (lyricsData?.synced) {
    for (let i = lyricsData.synced.length - 1; i >= 0; i--) {
      if (time >= lyricsData.synced[i].time) {
        activeLyricIdx = i;
        break;
      }
    }
  }

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        py: 2,
        px: 3,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* --- Üst Çentik (Playlist'e Dönüş Butonu) --- */}
      <Tooltip title="Çalma listesine geri dön">
        <Button
          onClick={onBackToPlaylist}
          variant="outlined"
          size="small"
          startIcon={<KeyboardArrowDown />}
          sx={{
            borderRadius: 6,
            textTransform: "none",
            px: 2.5,
            py: 0.5,
            borderColor: "divider",
            bgcolor: "action.hover",
            color: "text.secondary",
            "&:hover": {
              borderColor: "primary.main",
              color: "primary.main",
              bgcolor: "action.selected",
            },
            transition: "all 0.15s ease",
            boxShadow: 1,
          }}
        >
          Playlist'e Dön
        </Button>
      </Tooltip>

      {/* --- Orta Alan: Kapak Görseli veya Şarkı Sözleri --- */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          my: 1,
          width: "100%",
          maxWidth: 420,
          minHeight: 0,
        }}
      >
        {showLyrics ? (
          <Box
            ref={lyricsContainerRef}
            sx={{
              width: "100%",
              height: "min(40vh, 300px)",
              overflowY: "auto",
              textAlign: "center",
              px: 2,
              py: 4,
              borderRadius: 4,
              bgcolor: "action.hover",
              maskImage: "linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)",
            }}
          >
            {loadingLyrics && (
              <Typography color="text.secondary" sx={{ mt: 6 }}>
                Sözler aranıyor…
              </Typography>
            )}

            {!loadingLyrics && lyricsData?.synced && (
              <Stack spacing={2.5}>
                {lyricsData.synced.map((line, idx) => {
                  const isActive = idx === activeLyricIdx;
                  return (
                    <Typography
                      key={idx}
                      className={isActive ? "active-lyric" : ""}
                      onClick={() => engine.seek(line.time)}
                      sx={{
                        fontSize: isActive ? 20 : 15,
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? "primary.main" : "text.secondary",
                        opacity: isActive ? 1 : 0.6,
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        transform: isActive ? "scale(1.05)" : "scale(1)",
                        "&:hover": { opacity: 1 },
                      }}
                    >
                      {line.text}
                    </Typography>
                  );
                })}
              </Stack>
            )}

            {!loadingLyrics && !lyricsData?.synced && lyricsData?.plain && (
              <Typography
                variant="body2"
                sx={{
                  whiteSpace: "pre-wrap",
                  lineHeight: 2,
                  color: "text.secondary",
                }}
              >
                {lyricsData.plain}
              </Typography>
            )}

            {!loadingLyrics && !lyricsData && (
              <Typography color="text.secondary" sx={{ mt: 6 }}>
                Bu parça için şarkı sözü bulunamadı.
              </Typography>
            )}
          </Box>
        ) : (
          <>
            <Box
              title="Kapağı seç veya değiştir"
              onClick={openCurrentTrackCoverPicker}
              sx={{
                width: "min(36vh, 270px)",
                aspectRatio: "1",
                borderRadius: 4,
                bgcolor: "action.hover",
                cursor: path ? "pointer" : "default",
                backgroundImage: cover ? `url(${cover})` : "none",
                backgroundSize: "cover",
                backgroundPosition: "center",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 12px 36px rgba(0,0,0,0.4)",
                transition: "transform 0.2s ease",
                "&:hover": { transform: path ? "scale(1.02)" : "none" },
              }}
            >
              {!cover && <ImageIcon sx={{ fontSize: 64, color: "text.disabled" }} />}
            </Box>

            {/* Minimalist Ses Görselleştirici Çubuklar */}
            <Box sx={{ mt: 1.5, width: "100%" }}>
              <AudioVisualizer height={28} />
            </Box>
          </>
        )}

        {/* Sözler, EQ, Sıra ve Kapak Seç Butonları */}
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", justifyContent: "center", gap: 0.8 }}>
          <Chip
            size="small"
            icon={<LyricsIcon />}
            label="Sözler"
            color={showLyrics ? "primary" : "default"}
            variant={showLyrics ? "filled" : "outlined"}
            onClick={() => setShowLyrics(s => !s)}
            sx={{ cursor: "pointer" }}
          />
          <Chip
            size="small"
            icon={<Tune />}
            label="EQ"
            variant="outlined"
            onClick={onOpenEq}
            sx={{ cursor: "pointer" }}
          />
          <Chip
            size="small"
            icon={<QueueMusic />}
            label="Sıra"
            variant="outlined"
            onClick={onOpenQueue}
            sx={{ cursor: "pointer" }}
          />
          {path && (
            <Chip
              size="small"
              icon={<ImageSearch />}
              label="Kapak Bul"
              variant="outlined"
              onClick={openCurrentTrackCoverPicker}
              sx={{ cursor: "pointer" }}
            />
          )}
        </Stack>
      </Box>

      {/* --- Alt Alan: Şarkı Başlığı, Beğeni, Slider, Oynatma ve Ses Ayarı --- */}
      <Stack spacing={1.5} sx={{ width: "min(480px, 95%)", alignItems: "center" }}>
        <Box sx={{ textAlign: "center", maxWidth: "100%" }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "center" }}>
            <Typography variant="h6" noWrap sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
            {path && (
              <Tooltip title={liked ? "Beğenilenlerden çıkar" : "Beğen"}>
                <IconButton
                  size="small"
                  onClick={() => toggleFavorite(path)}
                  sx={{ color: liked ? "error.main" : "text.secondary" }}
                >
                  {liked ? <Favorite fontSize="small" /> : <FavoriteBorder fontSize="small" />}
                </IconButton>
              </Tooltip>
            )}
          </Stack>
          <Typography color="text.secondary" noWrap sx={{ fontSize: 13 }}>
            {folder}
          </Typography>
        </Box>

        {/* Zaman Çizelgesi */}
        <Box sx={{ width: "100%" }}>
          <Slider
            size="small"
            min={0}
            max={duration || 1}
            value={Math.min(shown, duration || 1)}
            onChange={(_, v) => setDrag(v as number)}
            onChangeCommitted={(_, v) => {
              engine.seek(v as number);
              setDrag(null);
            }}
            sx={{ py: 0.5 }}
          />
          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
              {fmt(shown)}
            </Typography>
            <Tooltip title="Kalan / Toplam süre için tıklayın">
              <Typography
                variant="caption"
                color="text.secondary"
                onClick={() => setShowRemaining(r => !r)}
                sx={{ fontFamily: "monospace", cursor: "pointer", "&:hover": { color: "text.primary" } }}
              >
                {showRemaining && duration > 0
                  ? `-${fmt(Math.max(0, duration - shown))}`
                  : fmt(duration)}
              </Typography>
            </Tooltip>
          </Stack>
        </Box>

        {/* Oynatma Kontrolleri */}
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Tooltip title={e.shuffle ? "Karışık Çalma: Açık" : "Karışık Çalma: Kapalı"}>
            <IconButton onClick={() => engine.toggleShuffle()} color={e.shuffle ? "primary" : "default"}>
              <Shuffle />
            </IconButton>
          </Tooltip>
          <IconButton onClick={() => engine.prev()}>
            <SkipPrevious fontSize="large" />
          </IconButton>
          <IconButton
            onClick={() => engine.toggle()}
            sx={{
              bgcolor: "primary.main",
              color: "primary.contrastText",
              "&:hover": { bgcolor: "primary.light" },
              width: 54,
              height: 54,
              boxShadow: 3,
            }}
          >
            {e.playing ? <Pause fontSize="large" /> : <PlayArrow fontSize="large" />}
          </IconButton>
          <IconButton onClick={() => engine.next()}>
            <SkipNext fontSize="large" />
          </IconButton>
          <Tooltip
            title={
              e.repeat === "all"
                ? "Tekrar: Tüm Liste"
                : e.repeat === "one"
                ? "Tekrar: Tek Parça"
                : "Tekrar: Kapalı"
            }
          >
            <IconButton onClick={() => engine.cycleRepeat()} color={e.repeat === "off" ? "default" : "primary"}>
              <Rep />
            </IconButton>
          </Tooltip>
        </Stack>

        {/* Ses Ayarlama Çubuğu */}
        <Stack
          direction="row"
          spacing={1.5}
          sx={{
            width: "min(280px, 85%)",
            alignItems: "center",
            pt: 0.5,
          }}
        >
          <Tooltip title={vol === 0 ? "Sesi Aç" : "Sesi Kapat (Mute)"}>
            <IconButton size="small" onClick={() => engine.toggleMute()} sx={{ color: "text.secondary" }}>
              <VolIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Slider
            size="small"
            min={0}
            max={1}
            step={0.01}
            value={vol}
            onChange={(_, v) => engine.setVolume(v as number)}
            sx={{ py: 0.5 }}
          />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ minWidth: 34, textAlign: "right", fontFamily: "monospace", fontSize: 11 }}
          >
            %{Math.round(vol * 100)}
          </Typography>
        </Stack>
      </Stack>

      <CoverPickerDialog
        target={coverTarget}
        onClose={() => setCoverTarget(null)}
        onStatus={m => setMsg(m)}
      />

      <Snackbar open={!!msg} autoHideDuration={3000} onClose={() => setMsg("")} message={msg} />
    </Box>
  );
}
