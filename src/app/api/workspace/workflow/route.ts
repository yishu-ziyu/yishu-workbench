import { NextResponse } from "next/server";
import { defaultWorkspaceRoot } from "@/lib/agent/paths";
import {
  loadWorkflow,
  saveWorkflow,
  type WorkflowState,
  type WfStage,
  type WfTask,
} from "@/lib/agent/tools/workflow-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function workspaceRoot(): string {
  return defaultWorkspaceRoot();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeWorkflow(raw: unknown): WorkflowState | null {
  if (!isRecord(raw)) return null;
  if (!Array.isArray(raw.stages) || !Array.isArray(raw.tasks)) return null;

  const stages: WfStage[] = raw.stages
    .filter(isRecord)
    .filter((s) => typeof s.id === "string" && typeof s.title === "string")
    .map((s) => ({
      id: s.id as string,
      title: s.title as string,
      ...(s.humanGate === true ? { humanGate: true as const } : {}),
    }));

  const tasks: WfTask[] = raw.tasks
    .filter(isRecord)
    .filter(
      (t) =>
        typeof t.id === "string" &&
        typeof t.title === "string" &&
        typeof t.stageId === "string",
    )
    .map((t) => {
      const priority =
        t.priority === "high" || t.priority === "low" || t.priority === "medium"
          ? t.priority
          : "medium";
      return {
        id: t.id as string,
        number: typeof t.number === "number" ? t.number : 0,
        title: t.title as string,
        excerpt: typeof t.excerpt === "string" ? t.excerpt : "",
        stageId: t.stageId as string,
        priority,
        assigneeId:
          typeof t.assigneeId === "string" ? t.assigneeId : "momo",
        updatedAt:
          typeof t.updatedAt === "string"
            ? t.updatedAt
            : new Date().toISOString(),
      };
    });

  return {
    id: typeof raw.id === "string" ? raw.id : "prd-spec",
    title: typeof raw.title === "string" ? raw.title : "PRD - Spec 评审",
    path: typeof raw.path === "string" ? raw.path : "",
    stages,
    tasks,
  };
}

/** GET disk SSOT: workspace/.agent/workflow-state.json */
export async function GET() {
  try {
    const workflow = loadWorkflow(workspaceRoot());
    return NextResponse.json({ ok: true, workflow });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** PUT full workflow state to disk SSOT */
export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as unknown;
    const raw = isRecord(body) && "workflow" in body ? body.workflow : body;
    const workflow = normalizeWorkflow(raw);
    if (!workflow) {
      return NextResponse.json(
        { ok: false, error: "workflow with stages+tasks required" },
        { status: 400 },
      );
    }
    saveWorkflow(workspaceRoot(), workflow);
    return NextResponse.json({ ok: true, workflow });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
