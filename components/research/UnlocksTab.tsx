"use client";

import { useState } from "react";
import {
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  FileSearch,
  LockKeyhole,
  Users,
} from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { TokenUnlock } from "@/lib/research/unlocks";
import {
  dollars,
  Loading,
  percentage,
  Problem,
  SignIn,
  Timestamp,
  useResearchResource,
} from "./shared";
import { useT } from "@/lib/i18n/client";

export function UnlocksTab({
  active,
  onReports,
}: {
  active: boolean;
  onReports: () => void;
}) {
  const t = useT();
  const auth = useElyraAuth();
  const [about, setAbout] = useState(false);
  const feed = useResearchResource<{
    configured: boolean;
    unlocks: TokenUnlock[];
    error?: string | null;
  }>("/api/research/unlocks?hours=168", active && auth.authenticated);
  return (
    <div>
      {!auth.authenticated ? (
        <SignIn>{t("Sign in to check unlock data availability.")}</SignIn>
      ) : (
        <>
          {feed.loading && !feed.data && (
            <Loading>{t("Checking unlock schedules…")}</Loading>
          )}
          {feed.error && <Problem retry={feed.reload}>{feed.error}</Problem>}
          {feed.data?.configured === false && (
            <>
              <div className="r-unlock-status">
                <span aria-hidden />
                {t("Data source not connected")}
              </div>
              <div className="r-empty r-unlock-empty">
                <LockKeyhole size={36} strokeWidth={1.25} aria-hidden />
                <h2>{t("Unlock data is unavailable")}</h2>
                <p>{t("Schedules will appear once a data source is connected.")}</p>
                <div className="r-actions">
                  <button
                    type="button"
                    className="r-button"
                    onClick={onReports}
                  >
                    <FileSearch size={17} aria-hidden />
                    {t("Explore reports")}
                  </button>
                  <button
                    type="button"
                    className="r-button r-borderless"
                    onClick={() => setAbout(true)}
                  >
                    {t("About unlocks ↗")}
                  </button>
                </div>
              </div>
            </>
          )}
          {feed.data?.configured &&
            (feed.data.error ? (
              <Problem retry={feed.reload}>
                {t("Unlock schedules could not be read. The connected source is unavailable.")}
              </Problem>
            ) : feed.data.unlocks.length === 0 ? (
              <div className="r-empty">
                <CalendarDays size={30} aria-hidden />
                <h2>{t("No upcoming unlocks")}</h2>
                <p>{t("No releases were found in the next seven days.")}</p>
              </div>
            ) : (
              <>
                <h2>{t("Upcoming unlocks · 7 days")}</h2>
                <div className="r-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{t("Date & token")}</th>
                        <th scope="col" className="r-number">
                          {t("Tokens")}
                        </th>
                        <th scope="col" className="r-number">
                          {t("Value")}
                        </th>
                        <th scope="col" className="r-number">
                          {t("Circulating supply")}
                        </th>
                        <th scope="col">{t("Allocation")}</th>
                        <th scope="col">{t("Source")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feed.data.unlocks.map((unlock, index) => (
                        <tr key={`${unlock.token}-${unlock.unlockAt}-${index}`}>
                          <td>
                            {unlock.token}
                            <br />
                            <time dateTime={unlock.unlockAt}>
                              {t("{value} UTC", { value: new Date(unlock.unlockAt).toLocaleDateString(
                                "en-GB",
                                { timeZone: "UTC" },
                              ) })}
                            </time>
                            {unlock.estimated && <small>{t("Estimated date")}</small>}
                          </td>
                          <td className="r-number">
                            {unlock.tokenAmount?.toLocaleString() ?? "—"}
                          </td>
                          <td className="r-number">
                            {dollars(unlock.valueUsd)}
                          </td>
                          <td className="r-number">
                            {percentage(unlock.percentOfCirculating)}
                          </td>
                          <td>{unlock.allocation ?? t("Undisclosed")}</td>
                          <td>
                            {unlock.sourceUrl ? (
                              <a
                                href={unlock.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {unlock.provider} ↗
                              </a>
                            ) : (
                              unlock.provider
                            )}
                            <Timestamp at={unlock.asOf} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ))}
        </>
      )}
      <div className="r-summaries r-unlock-explain">
        {[
          [CalendarDays, t("Date & token"), t("Upcoming releases")],
          [
            ChartNoAxesColumnIncreasing,
            t("Supply impact"),
            t("Tokens entering circulation"),
          ],
          [Users, t("Allocation"), t("Release recipients")],
        ].map(([Icon, title, text]) => {
          const Glyph = Icon as typeof CalendarDays;
          return (
            <article key={String(title)}>
              <Glyph size={22} strokeWidth={1.5} aria-hidden />
              <div>
                <h3>{String(title)}</h3>
                <p>{String(text)}</p>
              </div>
            </article>
          );
        })}
      </div>
      <Dialog open={about} onOpenChange={setAbout}>
        <DialogContent className="research-dialog">
          <DialogHeader>
            <DialogTitle>{t("About token unlocks")}</DialogTitle>
            <DialogDescription>
              {t("Unlocks describe scheduled supply releases, not future prices.")}
            </DialogDescription>
          </DialogHeader>
          <div className="r-dialog-body">
            <p>
              {t("Schedules show when tokens become transferable, how much may enter circulation, and the allocation receiving them. Estimated dates and missing values are identified when provided.")}
            </p>
            <p>
              {t("A release does not tell us whether recipients will sell. Schedules depend on a connected data source.")}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
