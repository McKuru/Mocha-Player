import { useEffect, useRef } from "react";
import { Box, useTheme } from "@mui/material";
import { engine } from "../audio/AudioEngine";

export default function AudioVisualizer({ height = 48 }: { height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const theme = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    const bufferLength = engine.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const primaryColor = theme.palette.primary.main;

    const render = () => {
      animId = requestAnimationFrame(render);
      engine.getFrequencyData(dataArray);

      const width = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, width, h);

      // Sadece 16 çubuk göster (temiz ve minimalist)
      const barCount = 16;
      const barWidth = Math.max(2, (width / barCount) - 3);
      const step = Math.floor(bufferLength / barCount);

      for (let i = 0; i < barCount; i++) {
        const val = dataArray[i * step] || 0;
        const percent = val / 255;
        const barHeight = Math.max(2, percent * (h - 4));
        const x = i * (barWidth + 3) + 2;
        const y = h - barHeight;

        ctx.fillStyle = primaryColor;
        ctx.globalAlpha = 0.45 + percent * 0.55;

        // Yuvarlatılmış veya düz çubuklar (tarayıcı uyumluluğu garantili)
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(x, y, barWidth, Math.max(1, barHeight), 2);
        } else {
          ctx.rect(x, y, barWidth, Math.max(1, barHeight));
        }
        ctx.fill();
      }
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [theme.palette.primary.main]);

  return (
    <Box sx={{ width: "100%", maxWidth: 280, height, mx: "auto", opacity: 0.85 }}>
      <canvas ref={canvasRef} width={280} height={height} style={{ width: "100%", height: "100%" }} />
    </Box>
  );
}
