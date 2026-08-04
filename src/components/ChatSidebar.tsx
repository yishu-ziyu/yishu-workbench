"use client";

import { useMemo, useState } from "react";
import type { AgentProfile, Conversation } from "@/lib/types";
import { IconPlus, IconSearch } from "./icons";

/** Session list with filter — chatbot-ui sidebar density + search */
export function ChatSidebar(props: {
  agents: AgentProfile[];
  conversations: Conversation[];
  activeId: string;
  activeAgentId: string;
  onSelectConversation: (id: string) => void;
  onSelectAgent: (id: string) => void;
  onNewChat: () => void;
}) {
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return props.conversations;
    return props.conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(s) ||
        props.agents
          .find((a) => a.id === c.agentId)
          ?.name.toLowerCase()
          .includes(s),
    );
  }, [props.conversations, props.agents, q]);

  return (
    <div
      className="flex h-full w-full min-w-0 flex-col border-r border-[var(--yxt-border-soft)] bg-white"
      data-yxt-role="thread-list"
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <span className="text-[15px] font-medium">对话</span>
        <div className="flex gap-1 text-[var(--yxt-muted)]">
          <button
            type="button"
            className={`rounded-md p-1.5 hover:bg-[var(--yxt-selected)] ${
              searchOpen ? "bg-[var(--yxt-selected)] text-[var(--yxt-ink)]" : ""
            }`}
            title="搜索"
            onClick={() => setSearchOpen((v) => !v)}
          >
            <IconSearch size={16} />
          </button>
        </div>
      </div>

      {searchOpen ? (
        <div className="px-3 pb-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索对话 / 同事…"
            className="w-full rounded-lg border border-[var(--yxt-border-soft)] bg-[#f7f8f9] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--yxt-border)]"
          />
        </div>
      ) : null}

      <div className="px-3 pb-2">
        <div className="mb-2 flex items-center justify-between text-xs text-[var(--yxt-muted)]">
          <span>新对话</span>
          <button
            type="button"
            className="rounded px-1 hover:bg-[var(--yxt-selected)]"
            aria-label="更改布局"
          >
            ⇄
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {props.agents.map((a) => {
            const on = props.activeAgentId === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => props.onSelectAgent(a.id)}
                className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs ${
                  on
                    ? "border-[var(--yxt-border)] bg-[var(--yxt-selected)]"
                    : "border-transparent bg-[#f5f6f7] hover:border-[var(--yxt-border-soft)]"
                }`}
                title={a.role}
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-white"
                  style={{ background: a.color }}
                >
                  {a.emoji}
                </span>
                <span className="max-w-[72px] truncate">
                  {a.name.replace("奕枢's ", "")}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={props.onNewChat}
            aria-label="新建"
            className="flex items-center gap-1 rounded-full bg-[#f5f6f7] px-2 py-1 text-xs text-[var(--yxt-muted)] hover:bg-[var(--yxt-selected)]"
          >
            <IconPlus size={14} />
            <span>新建</span>
          </button>
        </div>
      </div>

      <div className="yxt-scroll flex-1 overflow-y-auto px-2 pb-4">
        <div className="px-2 py-2 text-xs text-[var(--yxt-muted)]">
          {q.trim() ? `结果 · ${filtered.length}` : "今天"}
        </div>
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-[var(--yxt-muted)]">
            无匹配对话
          </div>
        ) : null}
        {filtered.map((c) => {
          const on = c.id === props.activeId;
          const agent = props.agents.find((a) => a.id === c.agentId);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => props.onSelectConversation(c.id)}
              className={`mb-0.5 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] ${
                on ? "bg-[var(--yxt-selected)]" : "hover:bg-[#f7f8f9]"
              }`}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] text-white"
                style={{ background: agent?.color || "#999" }}
              >
                {agent?.emoji || "✦"}
              </span>
              <span className="truncate">{c.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
