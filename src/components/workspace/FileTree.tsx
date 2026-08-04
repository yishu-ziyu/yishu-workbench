"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildFileTree,
  pathBreadcrumb,
  type FileTreeNode,
  type FlatFsEntry,
} from "@/lib/file-tree";

function TreeNodeView(props: {
  node: FileTreeNode;
  depth: number;
  openPath: string | null;
  expanded: Set<string>;
  toggle: (path: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const { node } = props;
  const pad = 8 + props.depth * 14;

  if (node.kind === "folder") {
    const isOpen = props.expanded.has(node.path);
    return (
      <div>
        <button
          type="button"
          onClick={() => props.toggle(node.path)}
          className="flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-[13px] hover:bg-[#f7f8f9]"
          style={{ paddingLeft: pad }}
          data-yxt-role="tree-folder"
          data-path={node.path}
        >
          <span className="w-3 text-[10px] text-[var(--yxt-muted)]">
            {isOpen ? "▾" : "▸"}
          </span>
          <span>📁</span>
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {isOpen
          ? (node.children || []).map((ch) => (
              <TreeNodeView
                key={ch.id}
                node={ch}
                depth={props.depth + 1}
                openPath={props.openPath}
                expanded={props.expanded}
                toggle={props.toggle}
                onOpenFile={props.onOpenFile}
              />
            ))
          : null}
      </div>
    );
  }

  const active = props.openPath === node.path;
  const icon =
    node.fileKind === "workflow" ? "🔀" : node.fileKind === "md" ? "📄" : "📎";
  return (
    <button
      type="button"
      onClick={() => props.onOpenFile(node.path)}
      className={`flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-[13px] ${
        active ? "bg-[var(--yxt-selected)]" : "hover:bg-[#f7f8f9]"
      }`}
      style={{ paddingLeft: pad }}
      data-yxt-role="tree-file"
      data-path={node.path}
    >
      <span className="w-3" />
      <span>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
      <span className="text-[10px] text-[var(--yxt-muted)]">{node.fileKind}</span>
    </button>
  );
}

export function WorkspaceFileTree(props: {
  files: FlatFsEntry[];
  openPath: string | null;
  fileContent: string;
  fileDirty: boolean;
  onOpenFile: (path: string) => void;
  onChangeContent: (v: string) => void;
  onSave: () => void;
}) {
  const tree = useMemo(() => buildFileTree(props.files), [props.files]);
  const crumbs = pathBreadcrumb(props.openPath);

  // expand all root folders by default + ancestors of open path
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const n of tree) {
      if (n.kind === "folder") s.add(n.path);
    }
    if (props.openPath) {
      const parts = props.openPath.split("/");
      let p = "";
      for (let i = 0; i < parts.length - 1; i++) {
        p = p ? `${p}/${parts[i]}` : parts[i];
        s.add(p);
      }
    }
    return s;
  });

  // when tree first loads with folders, expand roots once
  useEffect(() => {
    setExpanded((prev) => {
      if (prev.size > 0) return prev;
      const s = new Set(prev);
      for (const n of tree) {
        if (n.kind === "folder") s.add(n.path);
      }
      return s;
    });
  }, [tree]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div
      className="grid max-w-5xl gap-4 lg:grid-cols-2"
      data-yxt-role="workspace-tree"
    >
      <div>
        <p className="mb-3 text-[13px] text-[var(--yxt-muted)]">
          真实目录 <code className="rounded bg-[#f3f4f6] px-1">./workspace</code>
          · bolt 风格树（无 WebContainer）
        </p>
        <div className="yxt-scroll max-h-[480px] overflow-auto rounded-2xl border border-[var(--yxt-border-soft)] p-2">
          {tree.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12px] text-[var(--yxt-muted)]">
              空工作区
            </div>
          ) : (
            tree.map((n) => (
              <TreeNodeView
                key={n.id}
                node={n}
                depth={0}
                openPath={props.openPath}
                expanded={expanded}
                toggle={toggle}
                onOpenFile={props.onOpenFile}
              />
            ))
          )}
        </div>
      </div>
      <div className="flex min-h-[360px] flex-col rounded-2xl border border-[var(--yxt-border-soft)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--yxt-border-soft)] px-3 py-2 text-[13px]">
          <nav
            className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-[var(--yxt-muted)]"
            aria-label="breadcrumb"
            data-yxt-role="breadcrumb"
          >
            <span className="shrink-0">workspace</span>
            {crumbs.map((c, i) => (
              <span key={`${c}-${i}`} className="flex min-w-0 items-center gap-1">
                <span>/</span>
                <span
                  className={
                    i === crumbs.length - 1
                      ? "truncate font-medium text-[var(--yxt-ink)]"
                      : "truncate"
                  }
                >
                  {c}
                </span>
              </span>
            ))}
            {!props.openPath ? (
              <span className="text-[var(--yxt-muted)]">选择文件预览 / 编辑</span>
            ) : null}
          </nav>
          <button
            type="button"
            disabled={!props.openPath || !props.fileDirty}
            onClick={() => props.onSave()}
            className="shrink-0 rounded-lg bg-[var(--yxt-mint)] px-3 py-1 text-white disabled:opacity-40"
            data-yxt-role="file-save"
          >
            保存
          </button>
        </div>
        <textarea
          className="yxt-scroll flex-1 resize-none p-3 font-mono text-[12px] outline-none"
          value={props.fileContent}
          disabled={!props.openPath}
          onChange={(e) => props.onChangeContent(e.target.value)}
          placeholder="MD / workflow 内容…"
          data-yxt-role="file-editor"
        />
      </div>
    </div>
  );
}
