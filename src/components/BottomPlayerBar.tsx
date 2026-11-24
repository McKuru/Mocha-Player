import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Box,
  IconButton,
  Slider,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Favorite,
  FavoriteBorder,
  OpenInFull,
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
  Image as ImageIcon,
} from "@mui/icons-material";
import { engine, Track } from "../audio/AudioEngine";
import { folderName, isFavorite, toggleFavorite, useStoreVersion } from "../store";
import { useCoverUrl } from "../useCover";

const fmt = (s: number) => {
  if (isNaN(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export default function BottomPlayerBar({
  onOpenPlaylist,
  onOpenPlayer,
  onOpenQueue,
  onOpenEq,
}: {
  onOpenPlaylist: (track: Track) => void;
  onOpenPlayer: () => void;
  onOpenQueue: () => void;
  onOpenEq: () => void;
}) {
  useSyncExternalStore(
    f => engine.subscribe(f),
    () =>
      (engine.track?.path ?? "") +
      engine.playing +
      engine.shuffle +
      engine.repeat +
      engine.volume
  );
  useStoreVersion("favorites");

  const [time, setTime] = useState(() => engine.currentTime);
  const [drag, setDrag] = useState<number | null>(null);
  const [showRemaining, setShowRemaining] = useState(false);

  useEffect(() => {
    setTime(engine.currentTime);
    let raf = 0;
    const loop = () => {
      setTime(engine.currentTime);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const track = engine.track;
  const coverUrl = useCoverUrl("track", track?.path);

  if (!track) return null;

  const title = track.name.replace(/\.[^.]+$/, "");
  const folder = track.path.split(/[\\/]/).slice(-2, -1)[0] ?? folderName(track.path);
  const duration = engine.duration || 1;
  const currentTime = drag ?? time;
  const liked = isFavorite(track.path);

  const Rep = engine.repeat === "one" ? RepeatOne : Repeat;

  const volume = engine.volume;
  const VolIcon =
    volume === 0 ? VolumeOff : volume < 0.3 ? VolumeMute : volume < 0.7 ? VolumeDown : VolumeUp;

  return (
    <Box
      sx={{
        height: 76,
        borderTop: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        px: { xs: 1.5, sm: 2.5 },
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
        userSelect: "none",
        zIndex: 10,
        boxShadow: "0 -4px 16px rgba(0,0,0,0.25)",
      }}
    >
      {/* --- Sol Alan: Şarkı Kapağı & İsmi -> Oynatıcıya | Altındaki Playlist Butonu -> Playliste --- */}
      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          alignItems: "center",
          width: { xs: 180, sm: 240, md: 300 },
          minWidth: 0,
        }}
      >
        <Box
          onClick={onOpenPlayer}
          title="Oynatıcıyı aç"
          sx={{
            width: 50,
            height: 50,
            minWidth: 50,
            borderRadius: 2,
            bgcolor: "action.hover",
            cursor: "pointer",
            backgroundImage: coverUrl ? `url(${coverUrl})` : "none",
            backgroundSize: "cover",
            backgroundPosition: "center",
            display: "grid",
            placeItems: "center",
            transition: "transform 0.15s ease",
            "&:hover": { transform: "scale(1.05)" },
            boxShadow: 2,
          }}
        >
          {!coverUrl && <ImageIcon sx={{ fontSize: 24, color: "text.disabled" }} />}
        </Box>

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="body2"
            noWrap
            onClick={onOpenPlayer}
            title={`${title} (Oynatıcıyı aç)`}
            sx={{
              fontWeight: 600,
              cursor: "pointer",
              "&:hover": { color: "primary.main", textDecoration: "underline" },
            }}
          >
            {title}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            onClick={() => onOpenPlaylist(track)}
            title={`${folder} (Playliste git)`}
            sx={{
              display: "inline-block",
              maxWidth: "100%",
              cursor: "pointer",
              "&:hover": { color: "primary.main", textDecoration: "underline" },
            }}
          >
            {folder}
          </Typography>
        </Box>

        <Tooltip title={liked ? "Beğenilenlerden çıkar" : "Beğen"}>
          <IconButton
            size="small"
            onClick={() => toggleFavorite(track.path)}
            sx={{
              color: liked ? "error.main" : "text.secondary",
              "&:hover": { transform: "scale(1.15)" },
              transition: "transform 0.15s ease",
            }}
          >
            {liked ? <Favorite fontSize="small" /> : <FavoriteBorder fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Stack>

      {/* --- Orta Alan: Oynatma Butonları & Zaman Çizelgesi --- */}
      <Box
        sx={{
          flex: 1,
          maxWidth: 620,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.2 }}>
          <Tooltip title={engine.shuffle ? "Karışık: Açık" : "Karışık: Kapalı"}>
            <IconButton
              size="small"
              onClick={() => engine.toggleShuffle()}
              color={engine.shuffle ? "primary" : "default"}
              sx={{ opacity: engine.shuffle ? 1 : 0.65 }}
            >
              <Shuffle fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Önceki parça (Sol Ok)">
            <IconButton size="small" onClick={() => engine.prev()}>
              <SkipPrevious />
            </IconButton>
          </Tooltip>

          <IconButton
            onClick={() => engine.toggle()}
            title="Oynat / Duraklat (Boşluk)"
            sx={{
              bgcolor: "primary.main",
              color: "primary.contrastText",
              width: 38,
              height: 38,
              "&:hover": { bgcolor: "primary.light", transform: "scale(1.06)" },
              transition: "all 0.12s ease",
              boxShadow: 2,
            }}
          >
            {engine.playing ? <Pause fontSize="medium" /> : <PlayArrow fontSize="medium" />}
          </IconButton>

          <Tooltip title="Sonraki parça (Sağ Ok)">
            <IconButton size="small" onClick={() => engine.next()}>
              <SkipNext />
            </IconButton>
          </Tooltip>

          <Tooltip
            title={
              engine.repeat === "one"
                ? "Tekrar: Parça"
                : engine.repeat === "all"
                ? "Tekrar: Tümü"
                : "Tekrar: Kapalı"
            }
          >
            <IconButton
              size="small"
              onClick={() => engine.cycleRepeat()}
              color={engine.repeat === "off" ? "default" : "primary"}
              sx={{ opacity: engine.repeat === "off" ? 0.65 : 1 }}
            >
              <Rep fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        <Stack
          direction="row"
          spacing={1.5}
          sx={{ width: "100%", alignItems: "center", mt: -0.5 }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ minWidth: 36, textAlign: "right", fontFamily: "monospace", fontSize: 11 }}
          >
            {fmt(currentTime)}
          </Typography>

          <Slider
            size="small"
            min={0}
            max={duration}
            step={0.1}
            value={currentTime}
            onChange={(_, v) => setDrag(v as number)}
            onChangeCommitted={(_, v) => {
              engine.seek(v as number);
              setDrag(null);
            }}
            sx={{
              py: 1,
              "& .MuiSlider-track": {
                transition: "none",
              },
              "& .MuiSlider-thumb": {
                width: 10,
                height: 10,
                transition: "width 0.15s ease, height 0.15s ease, box-shadow 0.15s ease",
                "&:hover, &.Mui-focusVisible": {
                  boxShadow: "0 0 0 6px rgba(203,166,247, 0.16)",
                  width: 12,
                  height: 12,
                },
              },
            }}
          />

          <Typography
            variant="caption"
            color="text.secondary"
            onClick={() => setShowRemaining(r => !r)}
            title="Kalan / Toplam süre değiştir"
            sx={{
              minWidth: 36,
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: 11,
              "&:hover": { color: "text.primary" },
            }}
          >
            {showRemaining ? `-${fmt(Math.max(0, duration - currentTime))}` : fmt(duration)}
          </Typography>
        </Stack>
      </Box>

      {/* --- Sağ Alan: Ekolayzır, Sıra, Ses & Tam Ekran --- */}
      <Stack
        direction="row"
        spacing={0.8}
        sx={{
          alignItems: "center",
          justifyContent: "flex-end",
          width: { xs: 180, sm: 240, md: 280 },
        }}
      >
        <Tooltip title="Ekolayzır (EQ)">
          <IconButton size="small" onClick={onOpenEq}>
            <Tune fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip title="Çalma Sırası">
          <IconButton size="small" onClick={onOpenQueue}>
            <QueueMusic fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip title={volume === 0 ? "Sesi aç (M)" : "Sesi kapat (M)"}>
          <IconButton size="small" onClick={() => engine.toggleMute()}>
            <VolIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip title={`Ses: %${Math.round(volume * 100)}`}>
          <Slider
            size="small"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(_, v) => engine.setVolume(v as number)}
            sx={{
              width: { xs: 60, sm: 80, md: 90 },
              "& .MuiSlider-thumb": { width: 10, height: 10 },
            }}
          />
        </Tooltip>

        <Tooltip title="Oynatıcı Ekranı">
          <IconButton size="small" onClick={onOpenPlayer}>
            <OpenInFull fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>
  );
}
