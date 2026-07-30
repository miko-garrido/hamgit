import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        border: "var(--border)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: "var(--surface)",
        slate: {
          50: "var(--slate-50)",
          100: "var(--slate-100)",
          200: "var(--slate-200)",
          400: "var(--slate-400)",
          500: "var(--slate-500)",
          600: "var(--slate-600)",
          700: "var(--slate-700)",
          800: "var(--slate-800)",
          900: "var(--slate-900)",
        },
        "row-hover": "var(--row-hover)",
        "row-selected": "var(--row-selected)",
        "status-clean": "var(--status-clean)",
        "status-dirty": "var(--status-dirty)",
        "status-alert": "var(--status-alert)",
        "status-detached": "var(--status-detached)",
        emerald: {
          50: "var(--emerald-50)",
          200: "var(--emerald-200)",
          800: "var(--emerald-800)",
        },
        amber: {
          50: "var(--amber-50)",
          200: "var(--amber-200)",
          900: "var(--amber-900)",
        },
        red: {
          50: "var(--red-50)",
          200: "var(--red-200)",
          700: "var(--red-700)",
          800: "var(--red-800)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        mono: ["SFMono-Regular", "ui-monospace", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": "11px",
        xs: "12px",
        sm: "13px",
        base: "14px",
        md: "15px",
        lg: "16px",
        xl: "18px",
      },
      borderRadius: {
        xs: "5px",
        md: "6px",
        lg: "8px",
        xl: "10px",
        "2xl": "12px",
        full: "999px",
      },
      boxShadow: {
        floating: "var(--shadow-floating)",
        dialog: "var(--shadow-dialog)",
      },
    },
  },
  plugins: [],
} satisfies Config;
