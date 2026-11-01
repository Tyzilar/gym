import type { Metadata, Viewport } from "next";
import "./app.css";
import GymProvider from "@/components/gym/GymProvider";
import { TabBar } from "@/components/ui";
import ServiceWorker from "@/components/gym/ServiceWorker";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Gym",
  description: "Your training log — program, workouts, sets, progress and awards. Saved on your phone.",
  applicationName: "Gym",
  // iPhone "Add to Home Screen": open full-screen with a dark status bar.
  appleWebApp: { capable: true, title: "Gym", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: `${base}/icon-192.png`, sizes: "192x192", type: "image/png" },
      { url: `${base}/icon-512.png`, sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: `${base}/apple-touch-icon.png`, sizes: "180x180" }],
  },
};

// viewport-fit=cover lets the bottom tab bar sit above the iPhone home indicator.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <GymProvider>
          {children}
          <TabBar />
        </GymProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
