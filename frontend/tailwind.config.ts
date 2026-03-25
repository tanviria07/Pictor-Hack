import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          base: "#09090b",
          raised: "#0c0c0f",
          panel: "#101014",
          code: "#0d0d12",
        },
        border: {
          DEFAULT: "rgba(63, 63, 70, 0.5)",
          strong: "rgba(82, 82, 91, 0.65)",
        },
        accent: {
          DEFAULT: "#2563eb",
          muted: "#1d4ed8",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
    },
  },
  plugins: [],
};

export default config;
