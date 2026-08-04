"use client";

import { MarkdownBody } from "@/lib/markdown";
import type { AgentProfile, ChatMessage, ToolStep } from "@/lib/types";
import { useState } from "react";

/** Tool / thinking step row */
function StepRow({ step }: { step: ToolStep }) {
  const [open, setOpen] = useState(step.kind !== "think");
  const icon =
    step.kind === "think"
      ? "💭"
      : step.kind === "skill"
        ? "✦"
        : step.kind === "read"
          ? "📄"
          : step.kind === "cli"
            ? "⌘"
            : "⚙";
  return (
    <div className="group py-0.5 text-[13px] text-[var(--yxt-tool)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2 text-left hover:text-[var(--yxt-ink)]"
      >
        <span className="mt-0.5 opacity-70">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="inline-flex flex-wrap items-center gap-1">
            <span>{step.label || "步骤"}</span>
            {step.detail && open ? (
              <span className="rounded bg-[#f3f4f6] px-1.5 py-0.5 text-[12px] text-[var(--yxt-ink)]">
                {step.detail}
              </span>
            ) : null}
          </span>
        </span>
        <span className="mt-0.5 text-[10px] opacity-0 group-hover:opacity-60">
          {open ? "▾" : "▸"}
        </span>
      </button>
    </div>
  );
}

/** Message — assistant-ui Message-class bubble + markdown body */
export function Message(props: {
  msg: ChatMessage;
  agents: AgentProfile[];
  isStreaming?: boolean;
}) {
  const { msg, agents } = props;
  if (msg.role === "user") {
    return (
      <div className="mb-6 flex justify-end" data-yxt-role="user-message">
        <div className="max-w-[85%] rounded-2xl bg-[#f3f4f6] px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
  }
  const agent = agents.find((a) => a.id === msg.agentId);
  return (
    <div className="mb-8" data-yxt-role="assistant-message">
      {msg.steps?.length ? (
        <div className="mb-3 space-y-0.5 rounded-xl border border-[var(--yxt-border-soft)] bg-[#fafbfc] px-3 py-2">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--yxt-muted)]">
            工具 / 思考 · {msg.steps.length}
          </div>
          {msg.steps.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}
        </div>
      ) : null}
      <MarkdownBody content={msg.content} isStreaming={props.isStreaming} />
      <div className="mt-3 flex items-center gap-3 text-xs text-[var(--yxt-muted)]">
        <span>{msg.createdAt}</span>
        <button
          type="button"
          aria-label="复制"
          className="hover:text-[var(--yxt-ink)]"
          onClick={() => void navigator.clipboard.writeText(msg.content)}
        >
          复制
        </button>
        <span>{agent?.name}</span>
      </div>
    </div>
  );
}

export function LiveAssistantMessage(props: {
  steps?: ToolStep[];
  text?: string;
  agents: AgentProfile[];
}) {
  return (
    <div className="mb-8" data-yxt-role="assistant-message-live">
      {props.steps?.length ? (
        <div className="mb-3 space-y-0.5 rounded-xl border border-[var(--yxt-border-soft)] bg-[#fafbfc] px-3 py-2">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--yxt-muted)]">
            运行中…
          </div>
          {props.steps.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}
        </div>
      ) : null}
      {props.text ? (
        <MarkdownBody content={props.text} isStreaming />
      ) : (
        <div className="text-[13px] text-[var(--yxt-muted)]">正在调用本地 CLI…</div>
      )}
    </div>
  );
}
