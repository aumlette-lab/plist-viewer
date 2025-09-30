import { NextResponse } from "next/server";
import bplist from "bplist-parser";

// We avoid 'plist' package to keep bundle lean; bplist-parser can parse some XML?
// Actually bplist-parser is for binary only; we handle XML by basic detection + DOMParser via fast hack.
// But on Node (no DOMParser). We'll try a dynamic import of 'plist' at runtime to parse XML.
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (limit 10MB)" }, { status: 413 });
    }

    const buf = Buffer.from(await file.arrayBuffer());

    // Quick heuristic: bplist binary header starts with 'bplist'
    const isBinary = buf.slice(0, 6).toString("utf-8") === "bplist";

    let data: any;
    if (isBinary) {
      const parsed = bplist.parseBuffer(buf);
      // bplist parser returns an array of top-level objects
      data = parsed && parsed.length ? parsed[0] : parsed;
    } else {
      // XML path: lazy import 'plist' to avoid bundling when unused
      const plist = await import("plist");
      const text = buf.toString("utf-8");
      data = plist.parse(text);
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message || "Failed to parse plist/archive" }, { status: 400 });
  }
}
