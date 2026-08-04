/**
 * Flat path list → nested tree (bolt-style workbench file tree shape).
 * No WebContainer — pure structure for UI.
 */

export type FlatFsEntry = {
  path: string;
  name: string;
  kind: string;
  size: number;
};

export type FileTreeNode = {
  id: string;
  name: string;
  path: string;
  kind: "folder" | "file";
  fileKind?: string;
  size?: number;
  children?: FileTreeNode[];
};

export function buildFileTree(entries: FlatFsEntry[]): FileTreeNode[] {
  type Mutable = FileTreeNode & { childrenMap?: Map<string, Mutable> };
  const root = new Map<string, Mutable>();

  const ensureFolder = (
    map: Map<string, Mutable>,
    name: string,
    fullPath: string,
  ): Mutable => {
    let node = map.get(name);
    if (!node) {
      node = {
        id: fullPath || name,
        name,
        path: fullPath,
        kind: "folder",
        children: [],
        childrenMap: new Map(),
      };
      map.set(name, node);
    } else if (node.kind !== "folder") {
      // path collision: prefer folder
      node.kind = "folder";
      node.childrenMap = node.childrenMap || new Map();
      node.children = node.children || [];
    } else if (!node.childrenMap) {
      node.childrenMap = new Map();
      node.children = node.children || [];
    }
    return node;
  };

  // Prefer explicit folder entries + infer parents from file paths
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));

  for (const ent of sorted) {
    const parts = ent.path.split("/").filter(Boolean);
    if (!parts.length) continue;

    let map = root;
    let prefix = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      prefix = prefix ? `${prefix}/${part}` : part;
      const isLeaf = i === parts.length - 1;

      if (!isLeaf) {
        const folder = ensureFolder(map, part, prefix);
        map = folder.childrenMap!;
        continue;
      }

      if (ent.kind === "folder") {
        ensureFolder(map, part, ent.path);
      } else {
        // file leaf
        if (!map.has(part)) {
          map.set(part, {
            id: ent.path,
            name: part,
            path: ent.path,
            kind: "file",
            fileKind: ent.kind,
            size: ent.size,
          });
        }
      }
    }
  }

  const toArray = (map: Map<string, Mutable>): FileTreeNode[] => {
    const nodes = [...map.values()].map((n) => {
      const { childrenMap, ...rest } = n;
      if (rest.kind === "folder") {
        rest.children = childrenMap ? toArray(childrenMap) : rest.children || [];
      }
      return rest as FileTreeNode;
    });
    return nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  };

  return toArray(root);
}

/** Breadcrumb segments for a workspace-relative path */
export function pathBreadcrumb(filePath: string | null): string[] {
  if (!filePath) return [];
  return filePath.split("/").filter(Boolean);
}
