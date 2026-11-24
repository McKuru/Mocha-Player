import { useSyncExternalStore } from "react";
import {
  Box,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { Close, Delete, MusicNote, PlayArrow } from "@mui/icons-material";
import { engine } from "../audio/AudioEngine";
import { stem } from "../fs/library";

export default function QueueDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useSyncExternalStore(
    f => engine.subscribe(f),
    () => `${engine.pos}_${engine.order.length}_${engine.playing}`
  );

  const currentTrack = engine.track;
  const currentPos = engine.pos;
  const order = engine.order;
  const queue = engine.queue;

  const upcomingIndices = order.map((origIdx, orderIdx) => ({ origIdx, orderIdx })).filter(item => item.orderIdx > currentPos);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: { xs: "100%", sm: 380 },
            bgcolor: "background.paper",
            p: 2,
          },
        },
      }}
    >
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Çalma Sırası
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <Close />
        </IconButton>
      </Stack>

      {/* Şu An Çalan */}
      <Typography variant="subtitle2" color="primary.main" sx={{ fontWeight: 600, mb: 1 }}>
        Şu An Çalıyor
      </Typography>
      {currentTrack ? (
        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            bgcolor: "action.selected",
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            mb: 3,
          }}
        >
          <MusicNote color="primary" />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
              {stem(currentTrack.name)}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
              {currentTrack.path.split(/[\\/]/).slice(-2, -1)[0] ?? "—"}
            </Typography>
          </Box>
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Çalan parça yok
        </Typography>
      )}

      {/* Sıradaki Şarkılar */}
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Sıradaki Parçalar ({upcomingIndices.length})
        </Typography>
      </Stack>

      <List dense sx={{ flex: 1, overflow: "auto" }}>
        {upcomingIndices.map(({ origIdx, orderIdx }) => {
          const track = queue[origIdx];
          if (!track) return null;
          return (
            <ListItem
              key={orderIdx}
              disablePadding
              secondaryAction={
                <Tooltip title="Sıradan çıkar">
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={() => engine.removeFromQueue(orderIdx)}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </Tooltip>
              }
              sx={{ mb: 0.5 }}
            >
              <ListItemButton
                onClick={() => engine.playAt(orderIdx)}
                sx={{ borderRadius: 2, pr: 5 }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <PlayArrow fontSize="small" color="action" />
                </ListItemIcon>
                <ListItemText
                  primary={stem(track.name)}
                  secondary={track.path.split(/[\\/]/).slice(-2, -1)[0]}
                  slotProps={{
                    primary: { noWrap: true, sx: { fontSize: 13 } },
                    secondary: { noWrap: true, sx: { fontSize: 11 } },
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}

        {upcomingIndices.length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", mt: 4 }}>
            Sırada başka parça yok.
          </Typography>
        )}
      </List>
    </Drawer>
  );
}
