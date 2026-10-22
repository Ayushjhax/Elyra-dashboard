import { Screen, EmptyState } from "~/components/ui/layout";

/** A screen that exists in the navigation but is built by a later prompt. Says so, with no sample data. */
export function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <Screen>
      <EmptyState title={title} body={body} />
    </Screen>
  );
}
