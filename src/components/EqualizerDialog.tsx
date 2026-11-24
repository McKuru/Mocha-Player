import { useState, useSyncExternalStore } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  Slider,
  Stack,
  Typography,
} from "@mui/material";
import { engine, EQ_FREQS, EQ_PRESETS } from "../audio/AudioEngine";

const FREQ_LABELS = ["60 Hz", "250 Hz", "1 kHz", "4 kHz", "12 kHz"];
const FREQ_SUB = ["Sub Bas", "Bas", "Vokal", "Netlik", "Tiz"];

export default function EqualizerDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useSyncExternalStore(
    f => engine.subscribe(f),
    () => engine.eqGains.join(",")
  );

  const [preset, setPreset] = useState("Düz (Flat)");

  const handleSlider = (index: number, val: number) => {
    engine.setEqGain(index, val);
    setPreset("Özel");
  };

  const handlePreset = (p: string) => {
    setPreset(p);
    engine.applyEqPreset(p);
  };

  const handleReset = () => {
    handlePreset("Düz (Flat)");
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pb: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
          Ekolayzır (EQ)
        </Typography>
        <Button size="small" onClick={handleReset} sx={{ textTransform: "none" }}>
          Sıfırla
        </Button>
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ mb: 3 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
            Ön Ayar (Preset)
          </Typography>
          <Select
            size="small"
            fullWidth
            value={preset}
            onChange={e => handlePreset(e.target.value)}
          >
            {Object.keys(EQ_PRESETS).map(name => (
              <MenuItem key={name} value={name}>
                {name}
              </MenuItem>
            ))}
            {preset === "Özel" && <MenuItem value="Özel">Özel Ayar</MenuItem>}
          </Select>
        </Box>

        <Stack direction="row" spacing={2} sx={{ justifyContent: "space-around", height: 190, px: 1 }}>
          {EQ_FREQS.map((_, i) => {
            const gain = engine.eqGains[i] ?? 0;
            return (
              <Stack key={i} sx={{ alignItems: "center", height: "100%" }}>
                <Typography variant="caption" sx={{ fontSize: 10, fontFamily: "monospace", mb: 1 }}>
                  {gain > 0 ? `+${gain}` : gain} dB
                </Typography>
                <Slider
                  orientation="vertical"
                  size="small"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={gain}
                  onChange={(_, v) => handleSlider(i, v as number)}
                  sx={{
                    flex: 1,
                    "& .MuiSlider-thumb": { width: 12, height: 12 },
                  }}
                />
                <Typography variant="caption" sx={{ fontWeight: 600, mt: 1, fontSize: 11 }}>
                  {FREQ_LABELS[i]}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>
                  {FREQ_SUB[i]}
                </Typography>
              </Stack>
            );
          })}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
