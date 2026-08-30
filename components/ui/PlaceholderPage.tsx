import { Eyebrow } from "@/components/ui/Eyebrow";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";

/**
 * Routes that exist in the nav but are not built yet. Same shell, same panel
 * treatment — the surface is simply empty and says so.
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
      </PanelHeader>
      <PanelBody className="grid place-items-center p-4">
        <div className="max-w-sm text-center">
          <h1 className="type-h1 text-text-primary">{title}</h1>
          <p className="type-body mt-2 text-text-secondary">{description}</p>
        </div>
      </PanelBody>
    </Panel>
  );
}
