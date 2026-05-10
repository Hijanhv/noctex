import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        accent:   "#00ff88",
        sell:     "#ff3d6b",
        surface1: "#060606",
        surface2: "#0c0c0c",
        surface3: "#111111",
        dim:      "#3a3a3a",
        muted:    "#7a7a7a",
      },
      fontFamily: {
        display: ["'Chakra Petch'", "sans-serif"],
        mono:    ["'JetBrains Mono'", "monospace"],
      },
      animation: {
        "row-appear":  "row-appear 0.25s ease forwards",
        "glow-pulse":  "glow-pulse 2s ease-in-out infinite",
        "cursor-blink":"cursor-blink 1s step-end infinite",
        "number-tick": "number-tick 0.2s ease forwards",
      },
      keyframes: {
        "row-appear":  { from: { opacity: "0", transform: "translateX(-6px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        "glow-pulse":  { "0%,100%": { boxShadow: "0 0 8px rgba(0,255,136,0.15)" }, "50%": { boxShadow: "0 0 24px rgba(0,255,136,0.35)" } },
        "cursor-blink":{ "0%,100%": { opacity: "1" }, "50%": { opacity: "0" } },
        "number-tick": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
    },
  },
  plugins: [],
};
export default config;
