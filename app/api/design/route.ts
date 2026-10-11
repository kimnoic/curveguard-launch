import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { designLaunch, inputSchema } from "@/lib/launch-engine";

export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 8000) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    const input = inputSchema.parse(JSON.parse(text));
    return NextResponse.json(designLaunch(input), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof ZodError ? error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(" ")
      : error instanceof SyntaxError ? "Please provide valid JSON." : error instanceof Error ? error.message : "Unable to design this curve.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
