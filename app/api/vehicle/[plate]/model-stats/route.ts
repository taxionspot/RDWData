import { NextResponse } from "next/server";
import { parsePlateOrThrow } from "@/lib/api/plate";
import { getVehicleProfile } from "@/lib/rdw/service";
import { getModelStats } from "@/lib/stats/modelStats";

export const runtime = "nodejs";

type Params = { params: { plate: string } };

export async function GET(_request: Request, { params }: Params) {
  try {
    const plate = parsePlateOrThrow(params.plate);
    const profile = await getVehicleProfile(plate);
    const stats = await getModelStats(
      profile.vehicle.brand,
      profile.vehicle.tradeName,
      profile.vehicle.year
    );
    return NextResponse.json({ stats });
  } catch (error) {
    console.warn("Model stats endpoint failed; returning null stats.", error);
    return NextResponse.json({ stats: null });
  }
}
