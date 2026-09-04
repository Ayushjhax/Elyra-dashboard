import { RouteClose } from "@/components/shell/RouteClose";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { GlassPill } from "@/components/ui/GlassPill";
import { AmbientGlow } from "@/components/ui/Glow";
import { GlowMark } from "@/components/ui/GlowMark";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";

/**
 * Routes that exist in the nav but are not built yet. Same shell, same panel
 * treatment — the surface is simply empty and says so.
 *
 * It is also the one full-panel empty surface in the product, which is exactly
 * what 1.4 reserves gradients for and 1.6 reserves the mark for: the lemniscate
 * over a forest bloom, with a frosted marker saying where the route stands. No
 * bloom core lands under the copy — the light is above it and the text sits on
 * --surface-panel as it does everywhere else.
 */
export function PlaceholderPage({
  title,
  eyebrow,
  description,
}: {
  title: string;
  eyebrow: string;
  description: string;
}) {
  return (
    <Panel label={title} className="min-h-0 flex-1">
      <PanelHeader>
        <Eyebrow>{eyebrow}</Eyebrow>
        <div className="flex shrink-0 items-center gap-2">
          <GlassPill tone="neutral" dot>
            Not built yet
          </GlassPill>
          <RouteClose />
        </div>
      </PanelHeader>

      <PanelBody className="relative isolate grid place-items-center p-4">
        <AmbientGlow
          tone="forest"
          breathe
          className="left-1/2 top-[42%] size-[min(560px,105%)] -translate-x-1/2 -translate-y-1/2"
        />

        <div className="flex max-w-sm flex-col items-center text-center">
          <GlowMark className="mb-6 w-[min(280px,80%)]" />
          <h1 className="type-h1 text-text-primary">{title}</h1>
          <p className="type-body mt-2 text-text-secondary">{description}</p>
        </div>
      </PanelBody>
    </Panel>
  );
}
