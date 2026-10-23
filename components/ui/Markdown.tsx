import { useMemo } from "react";
import { parseMarkdown, type Block, type Inline } from "@/lib/markdown";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Rendered Markdown, every node an element (lib/markdown.ts says why).

   Sized for reading at length: body text at 14px with room between blocks,
   tables that scroll inside themselves rather than widening the page, and
   code in the mono face on a sunken surface.
--------------------------------------------------------------------------- */

function InlineNodes({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.t) {
          case "text":
            return <span key={index} className="whitespace-pre-line">{node.v}</span>;
          case "code":
            return (
              <code key={index} className="type-mono-addr rounded-chip bg-surface-base px-1 py-px text-text-primary">
                {node.v}
              </code>
            );
          case "strong":
            return (
              <strong key={index} className="font-semibold text-text-primary">
                <InlineNodes nodes={node.c} />
              </strong>
            );
          case "em":
            return (
              <em key={index}>
                <InlineNodes nodes={node.c} />
              </em>
            );
          case "link":
            return (
              <a
                key={index}
                href={node.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline decoration-accent-quiet underline-offset-2 hover:decoration-accent"
              >
                <InlineNodes nodes={node.c} />
              </a>
            );
        }
      })}
    </>
  );
}

const ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const;

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.t) {
          case "p":
            return (
              <p key={index}>
                <InlineNodes nodes={block.c} />
              </p>
            );
          case "h":
            return (
              <p key={index} role="heading" aria-level={block.level + 2} className="type-h2 pt-1 text-text-primary">
                <InlineNodes nodes={block.c} />
              </p>
            );
          case "ul":
            return (
              <ul key={index} className="flex list-disc flex-col gap-1 pl-5 marker:text-text-muted">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <InlineNodes nodes={item} />
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={index} start={block.start} className="flex list-decimal flex-col gap-1 pl-5 marker:text-text-muted">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <InlineNodes nodes={item} />
                  </li>
                ))}
              </ol>
            );
          case "code":
            return (
              <pre
                key={index}
                className="type-mono-addr overflow-x-auto rounded-control border border-border-subtle bg-surface-base p-3 text-text-primary"
              >
                <code>{block.v}</code>
              </pre>
            );
          case "quote":
            return (
              <blockquote key={index} className="flex flex-col gap-2 border-l-2 border-border-strong pl-3 text-text-secondary">
                <Blocks blocks={block.c} />
              </blockquote>
            );
          case "table":
            return (
              <div key={index} className="overflow-x-auto rounded-control border border-border-subtle">
                <table className="type-body-sm w-full border-collapse tabular-nums">
                  <thead className="bg-surface-raised">
                    <tr>
                      {block.head.map((cell, cellIndex) => (
                        <th
                          key={cellIndex}
                          scope="col"
                          className={cn(
                            "border-b border-border-subtle px-3 py-2 font-medium text-text-secondary",
                            ALIGN[block.align[cellIndex] ?? "left"],
                          )}
                        >
                          <InlineNodes nodes={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b border-border-subtle last:border-b-0">
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className={cn("px-3 py-2 text-text-primary", ALIGN[block.align[cellIndex] ?? "left"])}>
                            <InlineNodes nodes={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "hr":
            return <hr key={index} className="border-border-subtle" />;
        }
      })}
    </>
  );
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <div className={cn("type-body flex min-w-0 flex-col gap-3 break-words text-text-secondary", className)}>
      <Blocks blocks={blocks} />
    </div>
  );
}
