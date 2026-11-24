import { useEffect, useState } from "react";
import {
  Box, Button, Chip, Dialog, DialogContent, DialogTitle, Divider, Slider, Stack, ToggleButton,
  ToggleButtonGroup, Typography,
} from "@mui/material";
import { Check } from "@mui/icons-material";
import { join } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import { engine } from "../audio/AudioEngine";
import { pickFolder } from "../fs/library";
import {
  getSettings, getThemeSettings, patchSettings, setThemeSettings, useStoreVersion,
} from "../store";
import { ACCENTS, CustomColors, FLAVORS, FLAVOR_LIST, toCustomColors } from "../theme";

const FLAVOR_NAMES: Record<string, string> = { latte: "Latte", frappe: "Frappé", macchiato: "Macchiato", mocha: "Mocha" };
const CUSTOM_LABELS: [keyof CustomColors, string][] = [
  ["primary", "Ana renk"], ["background", "Arka plan"], ["paper", "Panel / diyalog"],
  ["text", "Yazı"], ["textSecondary", "İkincil yazı"], ["divider", "Çizgiler"], ["selection", "Seçim / hover"],
];

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
      <Typography variant="body2">{label}</Typography>
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: 44, height: 28, border: "none", background: "none", cursor: "pointer" }} />
    </Stack>
  );
}

function FolderRow({ title, value, onPick, status }:
  { title: string; value: string; onPick: () => void; status?: React.ReactNode }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="body2">{title}</Typography>
        <Button size="small" onClick={onPick}>Seç</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all", display: "block" }}>
        {value || "Seçilmedi"}
      </Typography>
      {status}
    </Box>
  );
}

export default function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  useStoreVersion("settings", "theme");
  const s = getSettings();
  const t = getThemeSettings();
  const [x, setX] = useState(engine.crossfade);
  const [ytFound, setYtFound] = useState<boolean | null>(null);

  useEffect(() => {
    if (!s.ytdlpDir) { setYtFound(null); return; }
    join(s.ytdlpDir, "yt-dlp.exe").then(exists).then(setYtFound).catch(() => setYtFound(false));
  }, [s.ytdlpDir]);

  const palette = FLAVORS[t.flavor];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" scroll="paper">
      <DialogTitle>Ayarlar</DialogTitle>
      <DialogContent dividers>
        {/* ---- Cross-fade ---- */}
        <Typography sx={{ fontWeight: 600 }} gutterBottom>Cross-fade: {x} sn</Typography>
        <Typography variant="caption" color="text.secondary">
          Parçanın son {x / 2} sn'si kısılırken sonrakinin ilk {x / 2} sn'si açılır.
        </Typography>
        <Slider min={0} max={12} step={0.5} value={x} marks valueLabelDisplay="auto"
          onChange={(_, v) => setX(v as number)}
          onChangeCommitted={(_, v) => { engine.setCrossfade(v as number); localStorage.setItem("xfade", String(v)); }} />

        <Divider sx={{ my: 2 }} />

        {/* ---- Tema ---- */}
        <Typography sx={{ fontWeight: 600 }} gutterBottom>Tema</Typography>
        <ToggleButtonGroup exclusive size="small" value={t.mode} sx={{ mb: 2 }}
          onChange={(_, v) => { if (v) setThemeSettings({ mode: v }); }}>
          <ToggleButton value="catppuccin">Catppuccin</ToggleButton>
          <ToggleButton value="custom">Özel</ToggleButton>
        </ToggleButtonGroup>

        {t.mode === "catppuccin" ? (
          <>
            <Typography variant="body2" gutterBottom>Flavor</Typography>
            <ToggleButtonGroup exclusive size="small" value={t.flavor} sx={{ mb: 2, flexWrap: "wrap" }}
              onChange={(_, v) => { if (v) setThemeSettings({ flavor: v }); }}>
              {FLAVOR_LIST.map(f => <ToggleButton key={f} value={f}>{FLAVOR_NAMES[f]}</ToggleButton>)}
            </ToggleButtonGroup>
            <Typography variant="body2" gutterBottom>Ana renk</Typography>
            <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", gap: 1 }}>
              {ACCENTS.map(a => (
                <Box key={a} title={a} onClick={() => setThemeSettings({ accent: a })}
                  sx={{ width: 30, height: 30, borderRadius: "50%", bgcolor: palette[a], cursor: "pointer",
                        display: "grid", placeItems: "center", border: 2,
                        borderColor: t.accent === a ? "text.primary" : "transparent" }}>
                  {t.accent === a && <Check sx={{ fontSize: 18, color: palette.crust }} />}
                </Box>
              ))}
            </Stack>
          </>
        ) : (
          <Stack spacing={1}>
            {CUSTOM_LABELS.map(([k, label]) => (
              <ColorField key={k} label={label} value={t.custom[k]}
                onChange={v => setThemeSettings({ custom: { ...t.custom, [k]: v } })} />
            ))}
            <Button size="small" sx={{ alignSelf: "flex-start" }}
              onClick={() => setThemeSettings({ custom: toCustomColors(t) })}>
              Catppuccin seçiminden kopyala
            </Button>
          </Stack>
        )}

        <Divider sx={{ my: 2 }} />

        {/* ---- yt-dlp ---- */}
        <Typography sx={{ fontWeight: 600 }} gutterBottom>yt-dlp</Typography>
        <FolderRow title="yt-dlp klasörü (içinde yt-dlp.exe olmalı)" value={s.ytdlpDir}
          onPick={async () => { const d = await pickFolder(); if (d) patchSettings({ ytdlpDir: d }); }}
          status={s.ytdlpDir && ytFound !== null && (
            <Chip size="small" sx={{ mt: 0.5 }} color={ytFound ? "success" : "error"}
              label={ytFound ? "yt-dlp.exe bulundu" : "Bu klasörde yt-dlp.exe yok"} />
          )} />
        <Typography variant="caption" color="text.secondary">
          Tekli şarkı indirirken hangi playliste ekleneceği, playlist indirirken ise oluşturulacak yeni playlistin ismi sorulur.
        </Typography>
      </DialogContent>
    </Dialog>
  );
}
