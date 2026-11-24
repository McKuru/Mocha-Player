import { createTheme, alpha } from "@mui/material/styles";

export type Flavor = "latte" | "frappe" | "macchiato" | "mocha";
export const FLAVOR_LIST: Flavor[] = ["latte", "frappe", "macchiato", "mocha"];

export const ACCENTS = [
  "rosewater", "flamingo", "pink", "mauve", "red", "maroon", "peach",
  "yellow", "green", "teal", "sky", "sapphire", "blue", "lavender",
] as const;
export type Accent = (typeof ACCENTS)[number];

const KEYS = [
  ...ACCENTS,
  "text", "subtext1", "subtext0", "overlay2", "overlay1", "overlay0",
  "surface2", "surface1", "surface0", "base", "mantle", "crust",
] as const;
export type Palette = Record<(typeof KEYS)[number], string>;

// Sıra: KEYS ile aynı (14 vurgu rengi + 12 nötr)
const mk = (v: string) =>
  Object.fromEntries(v.split(" ").map((h, i) => [KEYS[i], h])) as Palette;

export const FLAVORS: Record<Flavor, Palette> = {
  latte: mk("#dc8a78 #dd7878 #ea76cb #8839ef #d20f39 #e64553 #fe640b #df8e1d #40a02b #179299 #04a5e5 #209fb5 #1e66f5 #7287fd #4c4f69 #5c5f77 #6c6f85 #7c7f93 #8c8fa1 #9ca0b0 #acb0be #bcc0cc #ccd0da #eff1f5 #e6e9ef #dce0e8"),
  frappe: mk("#f2d5cf #eebebe #f4b8e4 #ca9ee6 #e78284 #ea999c #ef9f76 #e5c890 #a6d189 #81c8be #99d1db #85c1dc #8caaee #babbf1 #c6d0f5 #b5bfe2 #a5adce #949cbb #838ba7 #737994 #626880 #51576d #414559 #303446 #292c3c #232634"),
  macchiato: mk("#f4dbd6 #f0c6c6 #f5bde6 #c6a0f6 #ed8796 #ee99a0 #f5a97f #eed49f #a6da95 #8bd5ca #91d7e3 #7dc4e4 #8aadf4 #b7bdf8 #cad3f5 #b8c0e0 #a5adcb #939ab7 #8087a2 #6e738d #5b6078 #494d64 #363a4f #24273a #1e2030 #181926"),
  mocha: mk("#f5e0dc #f2cdcd #f5c2e7 #cba6f7 #f38ba8 #eba0ac #fab387 #f9e2af #a6e3a1 #94e2d5 #89dceb #74c7ec #89b4fa #b4befe #cdd6f4 #bac2de #a6adc8 #9399b2 #7f849c #6c7086 #585b70 #45475a #313244 #1e1e2e #181825 #11111b"),
};

/** Özel tema: tek tek ayarlanabilen öğeler */
export interface CustomColors {
  primary: string;       // ana renk (butonlar, slider)
  background: string;    // uygulama arka planı
  paper: string;         // diyalog / panel arka planı
  text: string;          // yazı
  textSecondary: string; // ikincil yazı
  divider: string;       // çizgiler
  selection: string;     // seçim / hover rengi
}

export interface ThemeSettings {
  mode: "catppuccin" | "custom";
  flavor: Flavor;
  accent: Accent;
  custom: CustomColors;
}

export const DEFAULT_THEME: ThemeSettings = {
  mode: "catppuccin",
  flavor: "mocha",
  accent: "mauve",
  custom: {
    primary: FLAVORS.mocha.mauve,
    background: FLAVORS.mocha.base,
    paper: FLAVORS.mocha.mantle,
    text: FLAVORS.mocha.text,
    textSecondary: FLAVORS.mocha.subtext0,
    divider: FLAVORS.mocha.surface0,
    selection: FLAVORS.mocha.mauve,
  },
};

interface Resolved {
  dark: boolean; primary: string; contrast: string; secondary: string;
  bg: string; paper: string; text: string; textSec: string; textDis: string;
  divider: string; rail: string; selection: string;
}

function lum(hex: string) {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function resolve(ts: ThemeSettings): Resolved {
  if (ts.mode === "custom") {
    const c = ts.custom;
    return {
      dark: lum(c.background) < 0.4,
      primary: c.primary,
      contrast: lum(c.primary) > 0.45 ? "#111111" : "#ffffff",
      secondary: c.primary,
      bg: c.background, paper: c.paper, text: c.text, textSec: c.textSecondary,
      textDis: alpha(c.text, 0.45), divider: c.divider, rail: alpha(c.text, 0.2),
      selection: c.selection,
    };
  }
  const p = FLAVORS[ts.flavor];
  const primary = p[ts.accent];
  return {
    dark: ts.flavor !== "latte",
    primary,
    contrast: ts.flavor === "latte" ? p.base : p.crust,
    secondary: p.rosewater,
    bg: p.base, paper: p.mantle, text: p.text, textSec: p.subtext0, textDis: p.overlay0,
    divider: p.surface0, rail: p.surface1, selection: primary,
  };
}

/** Mevcut Catppuccin seçiminden özel tema başlangıç renkleri üretir. */
export function toCustomColors(ts: ThemeSettings): CustomColors {
  const r = resolve({ ...ts, mode: "catppuccin" });
  return {
    primary: r.primary, background: r.bg, paper: r.paper, text: r.text,
    textSecondary: r.textSec, divider: r.divider, selection: r.selection,
  };
}

export function buildTheme(ts: ThemeSettings) {
  const r = resolve(ts);
  const st = FLAVORS[r.dark ? "mocha" : "latte"];
  return createTheme({
    palette: {
      mode: r.dark ? "dark" : "light",
      primary: { main: r.primary, contrastText: r.contrast },
      secondary: { main: r.secondary },
      error: { main: st.red }, warning: { main: st.peach },
      success: { main: st.green }, info: { main: st.blue },
      background: { default: r.bg, paper: r.paper },
      text: { primary: r.text, secondary: r.textSec, disabled: r.textDis },
      divider: r.divider,
      action: { hover: alpha(r.selection, 0.08), selected: alpha(r.selection, 0.16) },
    },
    shape: { borderRadius: 12 },
    typography: { fontFamily: '"Inter","Segoe UI",sans-serif', h5: { fontWeight: 600 } },
    components: {
      MuiCssBaseline: { styleOverrides: { body: { backgroundColor: r.bg, userSelect: "none" } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
      MuiSlider: { styleOverrides: { rail: { backgroundColor: r.rail, opacity: 1 } } },
      MuiDialog: { styleOverrides: { paper: { backgroundColor: r.paper } } },
      MuiMenu: { styleOverrides: { paper: { backgroundColor: r.paper } } },
    },
  });
}
