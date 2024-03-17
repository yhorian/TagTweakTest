/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        transparent: "transparent",
        current: "currentColor",
        "ttt-grey": "#f4f2ef",
        "off-white": "#d8d1bd",
        "ttt-orange": "#e68c3a",
        "ttt-blue": "#213e60",
      },
    },
  },
  plugins: [],
};
