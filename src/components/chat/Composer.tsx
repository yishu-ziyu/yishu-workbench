"use client";

import { useEffect, useRef, useState } from "react";
import type { CliProfile } from "@/lib/types";
import { IconMic, IconPlus, IconSend } from "../icons";

/**
 * Composer — assistant-ui Composer-class input.
 * Local CLI model selector is the only model path (YXT delta).
 */
export function Composer(props: {
  clis: CliProfile[];
  selectedCliId: string;
  onSelectCli: (id: string) => void;
  onSend: (text: string) => Promise<void>;
  onStop?: () => void;
  streaming?: boolean;
  contextLabel?: string;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.key === "l" || e.key === "L") &&
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey
      ) {
        const t = e.target as HTMLElement | null;
        if (
          t &&
          (t.tagName === "INPUT" ||
            t.tagName === "TEXTAREA" ||
            t.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = async () => {
    const t = text.trim();
    if (!t || props.streaming) return;
    setText("");
    await props.onSend(t);
    inputRef.current?.focus();
  };

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  return (
    <div className="shrink-0 px-6 pb-5 pt-2" data-yxt-role="composer">
      {props.contextLabel ? (
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--yxt-border-soft)] bg-white px-3 py-1 text-xs text-[var(--yxt-muted)]">
          <span>已选择：</span>
          <span className="text-[var(--yxt-ink)]">🔀 {props.contextLabel}</span>
        </div>
      ) : null}
      <div className="rounded-2xl border border-[var(--yxt-border-soft)] bg-white p-3 shadow-[0_4px_24px_rgba(15,23,42,0.04)]">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autoGrow(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={2}
          placeholder="有什么想问的（⌘/Ctrl+L 聚焦 · Enter 发送 · Shift+Enter 换行）"
          className="max-h-40 w-full resize-none border-0 bg-transparent text-[14px] outline-none placeholder:text-[var(--yxt-muted)]"
          data-yxt-role="composer-input"
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="添加"
              className="rounded-lg p-1.5 text-[var(--yxt-muted)] hover:bg-[var(--yxt-selected)]"
            >
              <IconPlus size={16} />
            </button>
            <select
              value={props.selectedCliId}
              onChange={(e) => props.onSelectCli(e.target.value)}
              className="rounded-lg border border-[var(--yxt-border-soft)] bg-[#f7f8f9] px-2 py-1 text-xs"
              title="本地 CLI Agent（相对 Moxt 的唯一差异）"
              data-yxt-role="cli-selector"
            >
              {props.clis.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                  {c.available === false ? " · 未安装" : ""}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-[var(--yxt-muted)]">本地 CLI</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full p-2 text-[var(--yxt-muted)] hover:bg-[var(--yxt-selected)]"
              title="语音"
            >
              <IconMic size={16} />
            </button>
            {props.streaming ? (
              <button
                type="button"
                onClick={() => props.onStop?.()}
                className="flex h-9 items-center gap-1.5 rounded-full bg-rose-500 px-3 text-[13px] text-white shadow-sm hover:bg-rose-600"
                aria-label="停止"
                data-yxt-role="composer-stop"
              >
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-white" />
                停止
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!text.trim()}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--yxt-mint)] text-white shadow-sm transition hover:bg-[var(--yxt-mint-deep)] disabled:opacity-40"
                aria-label="发送"
                data-yxt-role="composer-send"
              >
                <IconSend size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
