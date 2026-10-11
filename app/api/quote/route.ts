import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { quoteRequestSchema, quoteTrade } from "@/lib/launch-engine";

export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 10000) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    const v = quoteRequestSchema.parse(JSON.parse(text));
    return NextResponse.json(quoteTrade(v.input, v.weights, v.progress, v.direction, v.amount, v.slippageBps),
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof ZodError ? error.issues.map(i => i.message).join(" ")
      : error instanceof Error ? error.message : "Unable to quote this order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
