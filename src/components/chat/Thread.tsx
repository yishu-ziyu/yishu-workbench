"use client";

import { useEffect, useRef } from "react";
import type {
  AgentProfile,
  ChatMessage,
  CliProfile,
  Conversation,
  ToolStep,
} from "@/lib/types";
import { Message, LiveAssistantMessage } from "./Message";
import { Composer } from "./Composer";

/**
 * Thread — assistant-ui Thread-class: message stream + composer.
 * Stop while streaming; CLI selector stays app-owned (local only).
 */
export function Thread(props: {
  conversation: Conversation;
  agents: AgentProfile[];
  clis: CliProfile[];
  contextLabel?: string;
  selectedCliId: string;
  onSelectCli: (id: string) => void;
  onSend: (text: string) => Promise<void>;
  onStop?: () => void;
  streaming?: boolean;
  liveSteps?: ToolStep[];
  liveText?: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const agent = props.agents.find((a) => a.id === props.conversation.agentId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [props.conversation.messages, props.liveText, props.liveSteps]);

  return (
    <section
      className="flex min-w-0 flex-1 flex-col bg-white"
      data-yxt-role="thread"
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--yxt-border-soft)] px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs text-white"
            style={{ background: agent?.color || "#999" }}
          >
            {agent?.emoji || "✦"}
          </span>
          <span className="truncate text-[14px] font-medium">
            {agent?.name} / {props.conversation.title}
          </span>
          <span className="text-[var(--yxt-muted)]">▾</span>
        </div>
      </header>

      <div
        className="yxt-scroll flex-1 overflow-y-auto px-8 py-6"
        data-yxt-role="message-stream"
      >
        {props.conversation.messages.map((m: ChatMessage) => (
          <Message key={m.id} msg={m} agents={props.agents} />
        ))}
        {props.streaming ? (
          <LiveAssistantMessage
            steps={props.liveSteps}
            text={props.liveText}
            agents={props.agents}
          />
        ) : null}
        <div ref={bottomRef} />
      </div>

      <Composer
        clis={props.clis}
        selectedCliId={props.selectedCliId}
        onSelectCli={props.onSelectCli}
        onSend={props.onSend}
        onStop={props.onStop}
        streaming={props.streaming}
        contextLabel={props.contextLabel}
      />
    </section>
  );
}
