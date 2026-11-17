/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: { canvas: "#FAFAFC", ink: "#172033", muted: "#6F7890", brand: "#5B5BF0", coral: "#FF7A59" },
      borderRadius: { card: "20px", soft: "14px" },
      boxShadow: { card: "0 16px 45px rgba(34, 41, 75, .08), 0 2px 8px rgba(34, 41, 75, .04)" },
      fontFamily: { heading: ["Plus Jakarta Sans", "ui-sans-serif", "system-ui"], sans: ["Inter", "ui-sans-serif", "system-ui"] }
    }
  },
  plugins: []
};
