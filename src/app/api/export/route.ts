import { NextResponse, type NextRequest } from "next/server";
import { requireActor } from "@/server/auth/current";
import { AppError } from "@/server/errors";
import { buildExport, exportSchema } from "@/server/services/importExport";

export const dynamic = "force-dynamic";

/** CSV export. POST-only with a same-origin check to prevent cross-site triggering. */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).host !== req.headers.get("host")) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  try {
    const { actor } = await requireActor();
    const form = await req.formData();
    const get = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" && v ? v : undefined;
    };
    const parsed = exportSchema.safeParse({
      batchId: get("batchId"),
      dataset: get("dataset"),
      type: get("type"),
      byteId: get("byteId"),
      cadetId: get("cadetId"),
      categoryId: get("categoryId"),
      status: get("status"),
      from: get("from"),
      to: get("to"),
      includeVoided: get("includeVoided") === "1",
    });
    if (!parsed.success) return NextResponse.json({ error: "Invalid export filters" }, { status: 400 });
    const { csv, filename } = await buildExport(actor, parsed.data);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof AppError) {
      const status = e.code === "UNAUTHENTICATED" ? 401 : e.code === "NOT_FOUND" ? 404 : e.code === "FORBIDDEN" ? 403 : 400;
      return NextResponse.json({ error: e.message }, { status });
    }
    console.error("[str1k3] export failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
