import { NextResponse } from "next/server";
import {
  getRdwDatasetByPlate
} from "@/lib/rdw/service";
import { DATASETS } from "@/lib/rdw/endpoints";
import { parseDatasetOrThrow, parsePlateOrThrow } from "@/lib/api/plate";
import { errorResponse } from "@/lib/api/errors";

export const runtime = "nodejs";

type Params = { params: { dataset: string; plate: string } };

export async function GET(_: Request, { params }: Params) {
  try {
    const datasetKey = parseDatasetOrThrow(params.dataset);
    const plate = parsePlateOrThrow(params.plate);
    const records = await getRdwDatasetByPlate(datasetKey, plate);
    return NextResponse.json({
      plate,
      dataset: datasetKey,
      datasetId: DATASETS[datasetKey],
      count: records.length,
      records
    });
  } catch (error) {
    return errorResponse(error, "Unknown RDW lookup error.");
  }
}
