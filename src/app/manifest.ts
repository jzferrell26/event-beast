import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { id: "/", name: "Momentum Builder LIVE 2026", short_name: "MB LIVE", description: "Your agenda, your people, your next move.", start_url: "/", scope: "/", display: "standalone", background_color: "#f4f4f3", theme_color: "#111113", lang: "en",
    icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" }, { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }, { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }] };
}
