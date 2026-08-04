"use client";

import type { ReactNode } from "react";
import { Streamdown } from "streamdown";
import { stabilizeStreamingMarkdown } from "./stream-markdown";
import "streamdown/styles.css";

/**
 * Stream-safe reply render via vercel/streamdown.
 * Incomplete fences (streaming) do not break layout; complete fences get copy controls.
 */
export function MarkdownBody({
  content,
  isStreaming = false,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  const safe = stabilizeStreamingMarkdown(content);
  return (
    <div className="yxt-streamdown yxt-prose max-w-[48rem] text-[14.5px] text-[var(--yxt-ink)]">
      <Streamdown
        mode={isStreaming ? "streaming" : "static"}
        parseIncompleteMarkdown
        isAnimating={isStreaming}
        controls={{ code: true, table: true }}
        className="space-y-2"
      >
        {safe}
      </Streamdown>
    </div>
  );
}

/** @deprecated use MarkdownBody */
export function renderMarkdown(content: string): ReactNode {
  return <MarkdownBody content={content} />;
}

export { stabilizeStreamingMarkdown, hasIncompleteFence } from "./stream-markdown";
