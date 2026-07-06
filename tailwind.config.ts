import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(214 18% 88%)",
        background: "hsl(0 0% 98%)",
        foreground: "hsl(220 18% 13%)",
        surface: "#FFFFFF",
        slate: {
          50: "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1E293B",
          900: "#0F172A",
        },
        "row-hover": "#F1F3F6",
        "row-selected": "#E5EAF2",
        "status-clean": "#79AC8F",
        "status-dirty": "#D9A863",
        "status-alert": "#C67F7F",
        "status-detached": "#98A4B5",
        emerald: {
          50: "#F0F6F2",
          200: "#D3E5DA",
          800: "#4E7A63",
        },
        amber: {
          50: "#FAF6ED",
          200: "#EEDFC0",
          900: "#8A6F42",
        },
        red: {
          50: "#F9F1F1",
          200: "#EBD5D5",
          700: "#9C5F5F",
          800: "#8F5454",
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
        floating: "0 8px 24px rgba(15,23,42,0.12), 0 2px 6px rgba(15,23,42,0.06)",
        dialog: "0 24px 64px rgba(15,23,42,0.2), 0 4px 12px rgba(15,23,42,0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
