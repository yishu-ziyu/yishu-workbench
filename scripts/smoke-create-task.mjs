import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const workspace = path.join(root, "workspace");
function loadEnv(p){if(!fs.existsSync(p))return;for(const line of fs.readFileSync(p,"utf8").split(/\n/)){const t=line.trim();if(!t||t.startsWith("#"))continue;const i=t.indexOf("=");if(i<0)continue;const k=t.slice(0,i).trim();let v=t.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(!process.env[k])process.env[k]=v;}}
loadEnv(path.join(process.env.HOME,".config/ai-providers/env.local"));
process.env.YXT_LLM_PREFER=process.env.YXT_LLM_PREFER||"grok";
const jiti=(await import("jiti")).default;
const load=jiti(import.meta.url,{interopDefault:true,esmResolve:true});
const {resolveAutoProvider}=load(path.join(root,"src/lib/agent/providers/openai-compat.ts"));
const {runAgentOnce}=load(path.join(root,"src/lib/agent/loop.ts"));
const {BUSINESS_AGENTS}=load(path.join(root,"src/lib/agent/multi/orchestrator.ts"));
const {loadWorkflow}=load(path.join(root,"src/lib/agent/tools/workflow-tools.ts"));
const auto=resolveAutoProvider();
if(!auto.provider){console.log("SKIP");process.exit(0);}
const before=loadWorkflow(workspace).tasks.length;
const r=await runAgentOnce({
  prompt:"四项已确认：产品事项=Agent Runtime 验收面板；PRD作者=奕枢；PM=奕枢；Owner=奕枢。请 load_skill yxt-workflow 后创建一条高优先级任务到 draft，assignee prd-writer，标题带「Agent Runtime 验收面板」。不要评审长文。",
  agent: BUSINESS_AGENTS.momo, agentId:"momo", cwd:workspace, maxIterations:8,
},{provider:auto.provider,model:auto.model});
console.log("tools", r.toolsUsed);
console.log("final", (r.finalText||"").slice(0,400));
const after=loadWorkflow(workspace);
const created=after.tasks.some(t=>t.title.includes("Agent Runtime")||t.title.includes("验收面板"));
const ok=r.toolsUsed.includes("workflow_create_task")||created||after.tasks.length>before;
console.log(ok?"PASS create-task":"FAIL create-task", "tasks", before, "->", after.tasks.length);
process.exit(ok?0:2);
