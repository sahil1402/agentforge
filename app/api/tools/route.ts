import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/tools — list all tools
export async function GET() {
  const tools = await prisma.tool.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(tools);
}

// POST /api/tools — create a new tool
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.name || !body.description || !body.paramSchema || !body.code) {
    return NextResponse.json(
      { error: "name, description, paramSchema, and code are required" },
      { status: 400 }
    );
  }

  try {
    const tool = await prisma.tool.create({
      data: {
        name: body.name,
        description: body.description,
        paramSchema: body.paramSchema,
        returnSchema: body.returnSchema ?? null,
        code: body.code,
        category: body.category ?? "custom",
      },
    });
    return NextResponse.json(tool, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}