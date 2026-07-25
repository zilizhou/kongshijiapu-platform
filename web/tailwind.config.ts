import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#243044",
        muted: "#6b7a90",
        line: "#e2e8f0",
        panel: "#ffffff",
        soft: "#f3f6fa",
        sidebar: {
          DEFAULT: "#3d4f66",
          deep: "#334456",
        },
        accent: {
          DEFAULT: "#c94b4b",
          hover: "#b03d3d",
          soft: "#fdecea",
        },
        danger: "#c94b4b",
        warn: "#c9943a",
        ok: "#3d8f6a",
      },
      boxShadow: {
        card: "0 1px 0 rgba(36,48,68,0.04), 0 10px 28px rgba(36,48,68,0.06)",
      },
    },
  },
  plugins: [],
} satisfies Config;
