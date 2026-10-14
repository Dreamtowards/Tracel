import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  output: "export",
  transpilePackages: ["@tracel/timeline"],
};
export default config;
