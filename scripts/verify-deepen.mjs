/**
 * Gating tests for deepen items — drive real shipped pure modules + static source checks.
 * Run: node scripts/verify-deepen.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// Load TS via tsx if available, else transpile with a light dynamic approach
async function loadTs(rel) {
  const abs = path.join(root, rel);
  try {
    // Prefer tsx
    const { register: reg } = await import("tsx/esm/api");
    reg();
  } catch {
    /* try jiti */
  }
  try {
    const jiti = (await import("jiti")).default;
    const load = jiti(import.meta.url, { interopDefault: true });
    return load(abs);
  } catch {
    /* fall through */
  }
  // Manual: use esbuild-register style via typescript transpile
  const ts = await import("typescript");
  const src = fs.readFileSync(abs, "utf8");
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: abs,
  });
  const tmp = path.join(root, `.verify-tmp-${path.basename(rel)}.mjs`);
  fs.writeFileSync(tmp, outputText);
  try {
    return await import(pathToFileURL(tmp).href + `?t=${Date.now()}`);
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

const results = [];

function ok(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push({ name, pass: false, err: String(e) });
    console.error(`FAIL  ${name}`);
    console.error(e);
  }
}

// --- 1. stream markdown pure ---
const sm = await loadTs("src/lib/stream-markdown.ts");
ok("incomplete fence detected", () => {
  assert.equal(sm.hasIncompleteFence("hello\n```js\nconst x = 1\n"), true);
});
ok("incomplete fence stabilize closes", () => {
  const raw = "before\n```ts\nconst a = 1\n";
  const out = sm.stabilizeStreamingMarkdown(raw);
  assert.equal(sm.hasIncompleteFence(out), false);
  assert.ok(out.includes("```"));
  assert.ok(out.trimEnd().endsWith("```"));
});
ok("complete fence recognized", () => {
  const raw = "hi\n```js\nconsole.log(1)\n```\n";
  assert.equal(sm.hasIncompleteFence(raw), false);
  assert.equal(sm.looksLikeCompleteCodeFence(raw), true);
  const stable = sm.stabilizeStreamingMarkdown(raw);
  assert.equal(sm.looksLikeCompleteCodeFence(stable), true);
});
ok("stabilize does not throw on empty", () => {
  assert.equal(sm.stabilizeStreamingMarkdown(""), "");
});

// --- 2. file tree pure ---
const ft = await loadTs("src/lib/file-tree.ts");
ok("nested tree has parent folders and leaves", () => {
  const entries = [
    { path: "General", name: "General", kind: "folder", size: 0 },
    {
      path: "General/PRD/doc.md",
      name: "doc.md",
      kind: "md",
      size: 10,
    },
    { path: "Hub/verify.md", name: "verify.md", kind: "md", size: 3 },
  ];
  const tree = ft.buildFileTree(entries);
  assert.ok(tree.some((n) => n.kind === "folder" && n.name === "General"));
  const general = tree.find((n) => n.name === "General");
  assert.ok(general?.children?.length);
  const hasPrd = general.children.some(
    (c) => c.name === "PRD" || c.path.includes("PRD"),
  );
  assert.ok(hasPrd, "PRD folder under General");
  const hub = tree.find((n) => n.name === "Hub");
  assert.ok(hub);
  const leaf =
    hub.kind === "folder"
      ? hub.children?.find((c) => c.name === "verify.md")
      : null;
  assert.ok(leaf?.kind === "file");
});
ok("breadcrumb segments", () => {
  assert.deepEqual(ft.pathBreadcrumb("a/b/c.md"), ["a", "b", "c.md"]);
  assert.deepEqual(ft.pathBreadcrumb(null), []);
});

// --- 3. static chat wiring (send/stop/cli/thread-list) ---
ok("chat sources wire send stop cli selector thread-list", () => {
  const composer = fs.readFileSync(
    path.join(root, "src/components/chat/Composer.tsx"),
    "utf8",
  );
  const thread = fs.readFileSync(
    path.join(root, "src/components/chat/Thread.tsx"),
    "utf8",
  );
  const sidebar = fs.readFileSync(
    path.join(root, "src/components/ChatSidebar.tsx"),
    "utf8",
  );
  const app = fs.readFileSync(
    path.join(root, "src/components/WorkspaceApp.tsx"),
    "utf8",
  );
  assert.ok(composer.includes('data-yxt-role="composer-send"'));
  assert.ok(composer.includes('data-yxt-role="composer-stop"'));
  assert.ok(composer.includes('data-yxt-role="cli-selector"'));
  assert.ok(composer.includes("本地 CLI"));
  assert.ok(thread.includes("onStop") && thread.includes("Composer"));
  assert.ok(sidebar.includes('data-yxt-role="thread-list"'));
  assert.ok(app.includes("onStop") && app.includes("onSend"));
  assert.ok(app.includes("selectedCliId"));
});

// --- 4. streamdown in markdown + no webcontainer ---
ok("markdown uses streamdown; no webcontainer dep", () => {
  const md = fs.readFileSync(path.join(root, "src/lib/markdown.tsx"), "utf8");
  assert.ok(md.includes("streamdown") || md.includes("Streamdown"));
  assert.ok(md.includes("parseIncompleteMarkdown") || md.includes("stabilizeStreamingMarkdown"));
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );
  const all = JSON.stringify(pkg.dependencies || {});
  assert.ok(!all.toLowerCase().includes("webcontainer"));
  assert.ok(pkg.dependencies.streamdown);
  const runner = fs.readFileSync(
    path.join(root, "src/lib/cli-runner.ts"),
    "utf8",
  );
  assert.ok(runner.includes("runLocalCli") || runner.includes("spawn"));
});

// --- 5. workspace UI uses tree + same API endpoints ---
ok("workspace tree UI still uses /api/workspace/files", () => {
  const sec = fs.readFileSync(
    path.join(root, "src/components/SecondaryPanels.tsx"),
    "utf8",
  );
  assert.ok(sec.includes("WorkspaceFileTree"));
  assert.ok(sec.includes("/api/workspace/files"));
  const treeUi = fs.readFileSync(
    path.join(root, "src/components/workspace/FileTree.tsx"),
    "utf8",
  );
  assert.ok(treeUi.includes("buildFileTree"));
  assert.ok(treeUi.includes("breadcrumb") || treeUi.includes("Breadcrumb"));
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
