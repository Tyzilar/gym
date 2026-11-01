import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const dynamic = "force-static";

// "Add to Home Screen" opens Gym full-screen, like a normal app, with its own icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: `${base}/`,
    name: "Gym",
    short_name: "Gym",
    description: "Your training log — program, workouts, sets, progress and awards. Saved on your phone.",
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#f2f2f7",
    theme_color: "#f2f2f7",
    icons: [
      { src: `${base}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${base}/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Log a workout", url: `${base}/log?start=1` }],
  };
}
