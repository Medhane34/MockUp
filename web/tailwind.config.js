const { heroui } = require("@heroui/react"); // Your HeroUI import

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        // 1. CRITICAL: Add Tremor node_modules path so its components are scanned
        "./node_modules/@tremor/react/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        transparent: "transparent",
        current: "currentColor",
        extend: {
            colors: {
                // 2. OPTIONAL: You can customize Tremor colors here to match HeroUI Dark Mode palette
                tremor: {
                    brand: {
                        faint: "#0b1229",
                        muted: "#172554",
                        subtle: "#1e40af",
                        DEFAULT: "#3b82f6",
                        emphasis: "#60a5fa",
                        inverted: "#030712",
                    },
                    background: {
                        muted: "#131a2a",
                        subtle: "#1f2937",
                        DEFAULT: "#111827", // Dark theme background matching heroUI dark context
                        emphasis: "#d1d5db",
                    },
                    border: {
                        DEFAULT: "#1f2937",
                    },
                    content: {
                        subtle: "#4b5563",
                        DEFAULT: "#9ca3af",
                        emphasis: "#f3f4f6",
                        strong: "#f9fafb",
                        inverted: "#000000",
                    },
                },
            },
            boxShadow: {
                // Tremor components depend on these default shadow tokens
                "tremor-input": "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                "tremor-card": "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
                "tremor-dropdown": "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
            },
            borderRadius: {
                "tremor-small": "0.375rem",
                "tremor-default": "0.5rem",
                "tremor-full": "9999px",
            },
        },
    },
    // 3. CRITICAL: Safelist the color patterns you pass into Tremor components (e.g., colors={["emerald", "sky"]})
    safelist: [
        {
            pattern:
                /^(bg|text|border|stroke|fill)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900|950)$/,
            variants: ['hover', 'ui-selected'],
        },
    ],
    darkMode: "class",
    plugins: [heroui()], // Your HeroUI config plugin remains untouched
};
