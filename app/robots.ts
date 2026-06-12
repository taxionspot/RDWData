import type { MetadataRoute } from "next";

const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL ?? "https://kentekenrapport.com").replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/account"]
      }
    ],
    sitemap: `${BASE_URL}/sitemap.xml`
  };
}
