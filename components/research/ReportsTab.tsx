"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, FileText, Search } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { reportRequest, type ReportKind } from "@/lib/research/intent";
import type { FullReport, ReportRecord } from "@/lib/research/store";
import {
  Loading,
  Problem,
  SignIn,
  Timestamp,
  useResearchResource,
} from "./shared";

export function ReportsTab({ active }: { active: boolean }) {
  const auth = useElyraAuth();
  const request = useAuthedFetch();
  const library = useResearchResource<{ reports: ReportRecord[] }>(
    "/api/research/reports",
    active && auth.authenticated,
  );
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ReportKind>("auto");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useResearchResource<FullReport>(
    `/api/research/reports/${selected ?? ""}`,
    active && selected !== null && auth.authenticated,
  );
  const operation = useRef<AbortController | null>(null);
  const downloading = useRef(false);
  useEffect(() => () => operation.current?.abort(), []);
  const running = library.data?.reports.some(
    (report) => !["complete", "failed"].includes(report.status),
  );
  useEffect(() => {
    if (!active || !running || library.loading) return;
    const timer = setTimeout(library.reload, 2500);
    return () => clearTimeout(timer);
  }, [active, running, library.loading, library.data, library.reload]);

  const submit = async () => {
    if (operation.current || !query.trim()) return;
    if (!auth.authenticated) {
      auth.login();
      return;
    }
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError(null);
    try {
      const value = reportRequest(query, kind);
      const response = await request("/api/research/reports", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({ query: value }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error ?? "Could not start that report.");
      if (!controller.signal.aborted) library.reload();
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not start that report.",
        );
    } finally {
      operation.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  const download = async (report: ReportRecord) => {
    if (downloading.current) return;
    downloading.current = true;
    setError(null);
    try {
      const response = await request(
        `/api/research/reports/${report.id}/download`,
      );
      if (!response.ok)
        throw new Error("The PDF could not be downloaded. Try again.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${report.subjectName ?? "Elyra-report"}.pdf`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Download failed.");
    } finally {
      downloading.current = false;
    }
  };
  if (selected && !auth.authenticated)
    return <SignIn>Connect your wallet to view this report.</SignIn>;
  if (selected)
    return (
      <div>
        <button
          type="button"
          className="r-button"
          onClick={() => setSelected(null)}
        >
          <ArrowLeft size={16} aria-hidden />
          Your reports
        </button>
        {detail.loading && !detail.data && <Loading>Opening report…</Loading>}
        {detail.error && (
          <Problem retry={detail.reload}>{detail.error}</Problem>
        )}
        {detail.data && (
          <article className="r-report-document">
            <div className="r-section-heading">
              <div>
                <h2>{detail.data.subjectName ?? detail.data.query}</h2>
                <Timestamp at={detail.data.createdAt} label="Created" />
              </div>
              {detail.data.hasPdf && (
                <button
                  type="button"
                  className="r-button"
                  onClick={() => void download(detail.data!)}
                >
                  <Download size={16} aria-hidden />
                  Download PDF
                </button>
              )}
            </div>
            {error && <Problem>{error}</Problem>}
            {detail.data.document ? (
              <>
                {detail.data.document.sections.map((section) => (
                  <section key={section.id} className="r-section">
                    <h3>{section.title}</h3>
                    {section.blocks.map((block, index) => (
                      <div key={index} className="r-report-block">
                        {block.kind === "paragraph" ||
                        block.kind === "omission" ? (
                          <p>{block.text}</p>
                        ) : block.kind === "bullets" ? (
                          <ul>
                            {block.items.map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        ) : block.kind === "metrics" ? (
                          <dl className="r-metrics">
                            {block.metrics.map((metric, i) => (
                              <div key={i}>
                                <dt>
                                  {metric.label}
                                  {metric.nonGaap ? " · non-GAAP" : ""}
                                </dt>
                                <dd>
                                  {metric.value}
                                  {metric.change && (
                                    <small> · {metric.change}</small>
                                  )}
                                </dd>
                                {metric.note && <small>{metric.note}</small>}
                              </div>
                            ))}
                          </dl>
                        ) : (
                          <div className="r-table-scroll">
                            <table>
                              <caption>{block.table.caption}</caption>
                              <thead>
                                <tr>
                                  {block.table.columns.map((col, i) => (
                                    <th scope="col" key={i}>
                                      {col}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {block.table.rows.map((row, i) => (
                                  <tr key={i}>
                                    {row.map((cell, j) => (
                                      <td key={j}>{cell}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </section>
                ))}
                <section className="r-section">
                  <h3>Sources</h3>
                  {detail.data.document.sources.map((source) => (
                    <p key={source.id} className="r-source">
                      {source.url ? (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {source.label} ↗
                        </a>
                      ) : (
                        source.label
                      )}
                      <Timestamp at={source.asOf} />
                    </p>
                  ))}
                </section>
              </>
            ) : (
              <Problem>
                {detail.data.error ??
                  detail.data.statusDetail ??
                  "The report document is not available yet."}
              </Problem>
            )}
          </article>
        )}
      </div>
    );
  const reports = library.data?.reports ?? [];
  const visible = reports.filter(
    (report) =>
      filter === "all" ||
      (filter === "running"
        ? !["complete", "failed"].includes(report.status)
        : report.status === filter),
  );
  return (
    <div>
      <section className="r-composer">
        <h2>Create a report</h2>
        <form
          className="r-report-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="r-search">
            <Search size={20} aria-hidden />
            <span className="sr-only">
              Company, ticker, or research question
            </span>
            <input
              value={query}
              maxLength={250}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Company, ticker, or research question…"
            />
          </label>
          <label>
            <span className="sr-only">Report type</span>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as ReportKind)}
            >
              <option value="auto">Auto</option>
              <option value="earnings">Earnings</option>
              <option value="10-Q">10-Q</option>
              <option value="10-K">10-K</option>
            </select>
          </label>
          <button
            type="submit"
            className="r-button r-primary"
            disabled={busy || !query.trim()}
            aria-busy={busy}
          >
            {busy ? "Starting…" : "Research"}
          </button>
        </form>
        <div className="r-suggestions">
          {["NVDA latest earnings", "NVDA 10-Q", "MSFT 10-K"].map(
            (suggestion) => (
              <button
                type="button"
                key={suggestion}
                className="r-chip"
                onClick={() => {
                  setQuery(suggestion);
                  setKind("auto");
                }}
              >
                {suggestion}
              </button>
            ),
          )}
        </div>
        <p className="r-note">
          Built from SEC filings · XBRL · Public companies only.
        </p>
        {error && <Problem>{error}</Problem>}
      </section>
      <section className="r-section r-library">
        <div className="r-section-heading">
          <h2>
            Your reports{" "}
            <span className="r-count">
              {library.data ? reports.length : "—"}
            </span>
          </h2>
          <label>
            <span className="sr-only">Filter reports</span>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">All reports</option>
              <option value="complete">Completed</option>
              <option value="running">Generating</option>
              <option value="failed">Failed</option>
            </select>
          </label>
        </div>
        {!auth.authenticated ? (
          <SignIn>
            Connect a wallet to generate and view your saved reports.
          </SignIn>
        ) : (
          <>
            {library.loading && !library.data && (
              <Loading>Loading reports…</Loading>
            )}
            {library.error && (
              <Problem retry={library.reload}>{library.error}</Problem>
            )}
            {library.data && visible.length === 0 && (
              <div className="r-empty">
                <FileText size={36} strokeWidth={1.25} aria-hidden />
                <h3>
                  {reports.length === 0
                    ? "No reports yet"
                    : "No matching reports"}
                </h3>
                <p>
                  {reports.length === 0
                    ? "Choose a company above to start your research."
                    : "Choose another filter to view your reports."}
                </p>
              </div>
            )}
            {visible.map((report) => (
              <article key={report.id} className="r-report-row">
                <FileText size={20} aria-hidden />
                <div className="r-grow">
                  <h3>
                    {report.subjectName ?? report.query}
                    {report.periodLabel && ` · ${report.periodLabel}`}
                  </h3>
                  <p
                    className={
                      report.status === "failed" ? "r-negative" : "r-note"
                    }
                  >
                    {report.status === "complete"
                      ? report.quality === "verified_with_warnings"
                        ? "Saved · Verified with warnings"
                        : report.quality === "incomplete"
                          ? "Saved · Incomplete"
                          : "Saved · Complete"
                      : report.status === "failed"
                        ? (report.error ?? "Report failed")
                        : (report.statusDetail ?? report.status)}
                  </p>
                  <Timestamp at={report.createdAt} label="Created" />
                </div>
                <div className="r-actions">
                  {report.status === "complete" && (
                    <button
                      className="r-button"
                      type="button"
                      onClick={() => setSelected(report.id)}
                    >
                      View report
                    </button>
                  )}
                  {report.status === "complete" && report.hasPdf && (
                    <button
                      className="r-button"
                      type="button"
                      onClick={() => void download(report)}
                      aria-label={`Download ${report.subjectName ?? report.query}`}
                    >
                      <Download size={16} aria-hidden />
                      PDF
                    </button>
                  )}
                  {report.status === "failed" && (
                    <button
                      type="button"
                      className="r-button"
                      onClick={() => {
                        setQuery(report.query);
                        setKind("auto");
                      }}
                    >
                      Edit request
                    </button>
                  )}
                </div>
              </article>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
