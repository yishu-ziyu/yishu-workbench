import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import type { Dirent } from "node:fs";

export const runtime = "nodejs";

const ROOT = path.join(process.cwd(), "workspace");

function safeJoin(rel: string) {
  const full = path.resolve(ROOT, rel);
  if (!full.startsWith(ROOT)) throw new Error("path escape");
  return full;
}

async function walk(
  dir: string,
  base = "",
): Promise<{ path: string; name: string; kind: string; size: number }[]> {
  const out: { path: string; name: string; kind: string; size: number }[] = [];
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const name = String(ent.name);
    const rel = base ? `${base}/${name}` : name;
    const full = path.join(dir, name);
    if (ent.isDirectory()) {
      out.push({ path: rel, name, kind: "folder", size: 0 });
      out.push(...(await walk(full, rel)));
    } else {
      const st = await fs.stat(full);
      const ext = path.extname(name).toLowerCase();
      const kind =
        ext === ".md"
          ? "md"
          : name.endsWith(".workflow")
            ? "workflow"
            : ext === ".html"
              ? "html"
              : ext === ".csv"
                ? "csv"
                : "file";
      out.push({ path: rel, name, kind, size: st.size });
    }
  }
  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rel = url.searchParams.get("path");
  if (rel) {
    try {
      const full = safeJoin(rel);
      const content = await fs.readFile(full, "utf8");
      return NextResponse.json({ path: rel, content });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 404 },
      );
    }
  }
  await fs.mkdir(ROOT, { recursive: true });
  const files = await walk(ROOT);
  return NextResponse.json({ root: "workspace", files });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as { path?: string; content?: string };
  if (!body.path || typeof body.content !== "string") {
    return NextResponse.json({ error: "path+content required" }, { status: 400 });
  }
  try {
    const full = safeJoin(body.path);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body.content, "utf8");
    return NextResponse.json({ ok: true, path: body.path });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    path?: string;
    content?: string;
    kind?: string;
  };
  if (!body.path) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }
  try {
    const full = safeJoin(body.path);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body.content ?? "", "utf8");
    return NextResponse.json({ ok: true, path: body.path });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
