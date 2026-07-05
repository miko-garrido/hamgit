import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(214 18% 88%)",
        background: "hsl(0 0% 98%)",
        foreground: "hsl(220 18% 13%)",
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
    },
  },
  plugins: [],
} satisfies Config;
