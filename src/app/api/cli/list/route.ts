import { NextResponse } from "next/server";
import { listCliAvailability } from "@/lib/cli-runner";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ clis: listCliAvailability() });
}
