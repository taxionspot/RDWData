const CUSTOMER_KEY = process.env.NEXT_PUBLIC_IMAGIN_CUSTOMER_KEY ?? "nl-kentekenrapport";

interface ImageOptions {
  angle?: "01" | "09" | "28" | string;
  zoomtype?: "relative" | "fullscreen";
  width?: number;
  zoomlevel?: number;
  color?: string | null;
}

function normalizeColor(color: string | null | undefined): string | null {
  if (!color) return null;
  const raw = color.trim().toLowerCase();
  const map: Record<string, string> = {
    blauw: "blue",
    zwart: "black",
    wit: "white",
    grijs: "gray",
    groen: "green",
    rood: "red",
    geel: "yellow",
    bruin: "brown",
    zilver: "silver",
    oranje: "orange",
    paars: "purple"
  };
  return map[raw] ?? raw;
}

/**
 * Generates an IMAGIN.studio CDN image URL for a vehicle.
 * Based on the Mobile App plan constraints provided by the user.
 */
export function getVehicleImageUrl(
  make: string | null | undefined,
  model?: string | null | undefined,
  options: ImageOptions = {}
): string {
  // Neutral local placeholder when we have no make to render — never an
  // unrelated stock photo of a different car.
  const fallback = "/vehicle-placeholder.svg";

  if (!make) return fallback;

  const {
    angle = "01",
    zoomtype = "relative",
    width = 800,
    zoomlevel = 30,
    color
  } = options;

  const url = new URL("https://cdn.imagin.studio/getImage");
  url.searchParams.set("customer", CUSTOMER_KEY);
  url.searchParams.set("make", make.toLowerCase());
  
  if (model) {
    // IMAGIN.studio often uses modelFamily for the primary model name
    url.searchParams.set("modelFamily", model.toLowerCase());
  }
  
  url.searchParams.set("angle", angle);
  url.searchParams.set("zoomtype", zoomtype);
  url.searchParams.set("width", Math.min(width, 800).toString());
  url.searchParams.set("zoomlevel", Math.min(zoomlevel, 30).toString());
  url.searchParams.set("filetype", "jpeg");

  const paint = normalizeColor(color);
  if (paint) {
    // Ask IMAGIN for the closest matching body paint instead of default grey.
    url.searchParams.set("paintDescription", paint);
  }

  return url.toString();
}
