// app/manifest.ts
import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Aligoo Digital Agency",
        short_name: "Aligoo",
        description: "Digital Marketing, Web Design, SEO, and Facebook Ads Services in Ethiopia",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#FF595E",
        orientation: "portrait-primary",
        icons: [
            {
                src: "icon.jpeg",
                sizes: "192x192",
                type: "image/png",
                purpose: "maskable"
            },
            {
                src: "icon.jpeg",
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable"
            },
        ],
        screenshots: [
            {
                src: "icon.jpeg",
                sizes: "1280x720",
                type: "image/png",
                form_factor: "wide",
                label: "Aligoo Desktop View"
            },
            {
                src: "icon.jpeg",
                sizes: "750x1334",
                type: "image/png",
                form_factor: "narrow",
                label: "Aligoo Mobile View"
            }
        ],
        categories: ["business", "marketing", "productivity"],
        lang: "en",
        dir: "ltr"
    }
}