import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// GET /api/tools/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const tool = await prisma.tool.findUnique({ where: { id } });
  if (!tool) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(tool);
}

// PATCH /api/tools/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  try {
    const tool = await prisma.tool.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        paramSchema: body.paramSchema,
        returnSchema: body.returnSchema,
        code: body.code,
        category: body.category,
      },
    });
    return NextResponse.json(tool);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// DELETE /api/tools/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await prisma.tool.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}