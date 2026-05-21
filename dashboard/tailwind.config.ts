import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "Inter",
          "system-ui",
          "sans-serif",
        ],
        serif: ["Cormorant Garamond", "Garamond", "Georgia", "serif"],
      },
      colors: {
        ink: {
          50:  "#fafafa",
          100: "#f4f4f5",
          200: "#e4e4e7",
          400: "#a1a1aa",
          500: "#71717a",
          700: "#3f3f46",
          800: "#27272a",
          900: "#18181b",
          950: "#09090b",
        },
        gold: {
          200: "#f3e3a8",
          300: "#e8c574",
          400: "#d4af37",
          500: "#b8941e",
          600: "#8c6f17",
        },
        marble: {
          50:  "#f8f4ec",
          100: "#f5f0e6",
          200: "#ede5d2",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
