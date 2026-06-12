import type { MetadataRoute } from "next";

const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL ?? "https://kentekenrapport.com").replace(/\/+$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${BASE_URL}/`, lastModified, changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/pricing`, lastModified, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/privacy-policy`, lastModified, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/terms-and-conditions`, lastModified, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/cookie-policy`, lastModified, changeFrequency: "monthly", priority: 0.3 }
  ];
}
