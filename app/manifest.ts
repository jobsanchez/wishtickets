import type { MetadataRoute } from "next";

const SITE_NAME = "Wish Tickets Portal";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: "Wish Tickets",
    description:
      "Discover amazing events, book instantly, and create unforgettable memories.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a101f",
    theme_color: "#0a101f",
    icons: [
      {
        src: "/icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
