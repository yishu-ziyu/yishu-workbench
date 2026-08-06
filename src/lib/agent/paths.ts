import path from "node:path";

/** Default workspace root for the product (disk truth for files/skills/memory). */
export function defaultWorkspaceRoot(cwd?: string): string {
  if (cwd && cwd.trim()) return path.resolve(cwd.trim());
  // Prefer package workspace/ next to project root
  const fromEnv = process.env.YXT_WORKSPACE_ROOT?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), "workspace");
}

export function agentRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".agent");
}

export function memoryDir(workspaceRoot: string): string {
  return path.join(agentRoot(workspaceRoot), "memory");
}

export function trajectoriesDir(workspaceRoot: string): string {
  return path.join(agentRoot(workspaceRoot), "trajectories");
}

export function skillsDir(workspaceRoot: string): string {
  return path.join(agentRoot(workspaceRoot), "skills");
}

export function evalDir(workspaceRoot: string): string {
  return path.join(agentRoot(workspaceRoot), "eval");
}

export function workflowStatePath(workspaceRoot: string): string {
  return path.join(agentRoot(workspaceRoot), "workflow-state.json");
}
