import { useEffect, useState } from "react";
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  AutoAwesome,
  Close,
  FolderOpen,
  Search,
} from "@mui/icons-material";
import {
  applyCoverUrl,
  cleanQuery,
  CoverCandidate,
  fetchAndSetCover,
  Kind,
  searchCoverCandidates,
} from "../net/coverFetch";
import { chooseCover } from "../fs/library";

export interface CoverPickerTarget {
  key: string;
  query: string;
  kind: Kind;
  label: string;
}

export default function CoverPickerDialog({
  target,
  onClose,
  onStatus,
}: {
  target: CoverPickerTarget | null;
  onClose: () => void;
  onStatus?: (msg: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<CoverCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [applyingUrl, setApplyingUrl] = useState<string | null>(null);

  const runSearch = async (q: string, kind: Kind) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await searchCoverCandidates(q, kind);
      setCandidates(res);
    } catch {
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!target) {
      setCandidates([]);
      return;
    }
    const cleaned = cleanQuery(target.query) || target.query;
    setQuery(cleaned);
    runSearch(cleaned, target.kind);
  }, [target]);

  if (!target) return null;

  const handleSelectCandidate = async (c: CoverCandidate) => {
    setApplyingUrl(c.url);
    const ok = await applyCoverUrl(target.key, c.url);
    setApplyingUrl(null);
    if (ok) {
      onStatus?.(`Kapak güncellendi (${c.source})`);
      onClose();
    } else {
      onStatus?.("Seçilen kapak indirilemedi, başka bir alternatif deneyin");
    }
  };

  const handleAutoAlternative = async () => {
    setApplyingUrl("__auto__");
    const ok = await fetchAndSetCover(target.key, query || target.query, target.kind, true);
    setApplyingUrl(null);
    if (ok) {
      onStatus?.("Alternatif kapak uygulandı");
      onClose();
    } else {
      onStatus?.("Alternatif kapak bulunamadı");
    }
  };

  const handlePickLocal = async () => {
    const ok = await chooseCover(target.key);
    if (ok) {
      onStatus?.("Dosyadan kapak seçildi");
      onClose();
    }
  };

  return (
    <Dialog open={Boolean(target)} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}>
        <Box sx={{ minWidth: 0, pr: 2 }}>
          <Typography variant="h6" component="div" noWrap sx={{ fontWeight: 700 }}>
            Kapak Seç / Alternatif Bul
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
            {target.label}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ minHeight: 340 }}>
        {/* Arama Çubuğu & Hızlı Alternatif */}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ mb: 2.5, alignItems: { xs: "stretch", sm: "center" } }}
        >
          <TextField
            fullWidth
            size="small"
            placeholder="Şarkı, sanatçı veya albüm adı yazın…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") runSearch(query, target.kind);
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" />
                  </InputAdornment>
                ),
                sx: { userSelect: "text" },
              },
            }}
          />
          <Button
            variant="contained"
            onClick={() => runSearch(query, target.kind)}
            disabled={loading || !query.trim()}
            sx={{ minWidth: 90, textTransform: "none" }}
          >
            Ara
          </Button>
          <Button
            variant="outlined"
            startIcon={<AutoAwesome />}
            onClick={handleAutoAlternative}
            disabled={loading || applyingUrl !== null}
            sx={{ whiteSpace: "nowrap", textTransform: "none" }}
          >
            Sonraki Alternatif
          </Button>
        </Stack>

        {/* Aday Kapak Izgarası */}
        {loading ? (
          <Box sx={{ py: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <CircularProgress size={36} />
            <Typography variant="body2" color="text.secondary">
              iTunes, YouTube ve Deezer üzerinden alternatif kapaklar aranıyor…
            </Typography>
          </Box>
        ) : candidates.length === 0 ? (
          <Box sx={{ py: 6, textAlign: "center" }}>
            <Typography color="text.secondary">
              Bu arama için kapak bulunamadı. Yukarıdaki arama kutusuna sanatçı veya şarkı adını farklı
              yazarak tekrar arayabilirsiniz.
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              gap: 2,
            }}
          >
            {candidates.map((c, idx) => {
              const isApplying = applyingUrl === c.url;
              return (
                <ButtonBase
                  key={c.url + idx}
                  onClick={() => handleSelectCandidate(c)}
                  disabled={applyingUrl !== null}
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    textAlign: "left",
                    borderRadius: 2.5,
                    overflow: "hidden",
                    bgcolor: "action.hover",
                    border: 1,
                    borderColor: "divider",
                    transition: "all 0.15s ease",
                    "&:hover": {
                      transform: "translateY(-2px)",
                      borderColor: "primary.main",
                      boxShadow: 4,
                    },
                  }}
                >
                  <Box sx={{ position: "relative", width: "100%", aspectRatio: "1", bgcolor: "background.default" }}>
                    <Box
                      component="img"
                      src={c.previewUrl}
                      alt={c.title}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      sx={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                    <Chip
                      size="small"
                      label={c.source}
                      color={
                        c.source === "iTunes"
                          ? "primary"
                          : c.source === "YouTube"
                          ? "error"
                          : "secondary"
                      }
                      sx={{
                        position: "absolute",
                        top: 6,
                        left: 6,
                        height: 20,
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    />
                    {isApplying && (
                      <Box
                        sx={{
                          position: "absolute",
                          inset: 0,
                          bgcolor: "rgba(0,0,0,0.6)",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <CircularProgress size={28} />
                      </Box>
                    )}
                  </Box>
                  <Box sx={{ p: 1, width: "100%" }}>
                    <Typography variant="caption" noWrap sx={{ fontWeight: 600, display: "block" }}>
                      {c.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 11, display: "block" }}>
                      {c.subtitle}
                    </Typography>
                  </Box>
                </ButtonBase>
              );
            })}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ justifyContent: "space-between", px: 2.5, py: 1.5 }}>
        <Button
          size="small"
          startIcon={<FolderOpen />}
          onClick={handlePickLocal}
          sx={{ textTransform: "none" }}
        >
          Bilgisayardan Dosya Seç…
        </Button>
        <Button size="small" onClick={onClose} sx={{ textTransform: "none" }}>
          Kapat
        </Button>
      </DialogActions>
    </Dialog>
  );
}
