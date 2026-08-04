"use client";

import type { ComponentType } from "react";
import type { NavKey } from "@/lib/types";
import {
  IconBell,
  IconChat,
  IconClock,
  IconFolder,
  IconGift,
  IconLink,
  IconPuzzle,
  IconUsers,
  IconWorkflow,
} from "./icons";

type IconComp = ComponentType<{ size?: number; className?: string }>;

const MAIN: {
  key: NavKey;
  label: string;
  Icon: IconComp;
}[] = [
  { key: "chat", label: "对话", Icon: IconChat },
  { key: "workspace", label: "工作空间", Icon: IconFolder },
  { key: "members", label: "成员", Icon: IconUsers },
  { key: "workflows", label: "工作流", Icon: IconWorkflow },
  { key: "skills", label: "技能", Icon: IconPuzzle },
  { key: "automation", label: "自动化", Icon: IconClock },
  { key: "integrations", label: "集成", Icon: IconLink },
];

const BOTTOM: {
  key: NavKey;
  label: string;
  Icon?: IconComp;
  avatar?: boolean;
}[] = [
  { key: "hub", label: "广场", Icon: IconGift },
  { key: "inbox", label: "收件箱", Icon: IconBell },
  { key: "settings", label: "账号", avatar: true },
];

export function IconRail(props: {
  active: NavKey;
  onChange: (k: NavKey) => void;
  inboxCount?: number;
}) {
  return (
    <aside className="flex h-full w-[72px] shrink-0 flex-col items-center border-r border-[var(--yxt-border-soft)] bg-[var(--yxt-rail)] py-3">
      <button
        className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-[#0e0f11] text-sm font-semibold text-white"
        title="工作空间 YXT"
        type="button"
        onClick={() => props.onChange("workspace")}
      >
        Y
      </button>
      <nav className="flex flex-1 flex-col items-center gap-1">
        {MAIN.map((item) => {
          const on = props.active === item.key;
          return (
            <button
              key={item.key}
              type="button"
              aria-label={item.label}
              onClick={() => props.onChange(item.key)}
              className={`flex h-[54px] w-11 flex-col items-center justify-center gap-1 rounded-xl text-[11px] leading-tight transition ${
                on
                  ? "bg-white text-[var(--yxt-ink)] shadow-sm"
                  : "text-[var(--yxt-muted)] hover:bg-white/70"
              }`}
            >
              <item.Icon size={18} />
              <span className="scale-90">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col items-center gap-1">
        {BOTTOM.map((item) => {
          const on = props.active === item.key;
          if (item.avatar) {
            return (
              <button
                key={item.key}
                type="button"
                aria-label={item.label}
                onClick={() => props.onChange(item.key)}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-pink-400 to-violet-500 text-[11px] font-medium text-white"
              >
                奕
              </button>
            );
          }
          return (
            <button
              key={item.key}
              type="button"
              aria-label={item.label}
              onClick={() => props.onChange(item.key)}
              className={`relative flex h-9 w-11 items-center justify-center rounded-xl ${
                on
                  ? "bg-white text-[var(--yxt-ink)] shadow-sm"
                  : "text-[var(--yxt-muted)] hover:bg-white/70"
              }`}
            >
              {item.Icon ? <item.Icon size={18} /> : null}
              {item.key === "inbox" && (props.inboxCount || 0) > 0 ? (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-500" />
              ) : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
