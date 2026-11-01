import type { NextConfig } from "next";

// Static site for GitHub Pages: https://<user>.github.io/gym/
// Everything runs in the browser and saves on the phone — there is no server.
const basePath = process.env.GYM_BASE_PATH ?? "/gym";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
