"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { supabase } from "@/lib/supabase/client";
import { getProfile, getMySchedule } from "@/lib/db";
import type { ScheduledJob } from "@/lib/types";

const today = new Date().toISOString().split("T")[0];

function formatDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return new Date(Number(y), Number(m) - 1, Number(day)).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

export default function SchedulePage() {
  const [upcoming, setUpcoming] = useState<ScheduledJob[]>([]);
  const [past, setPast] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const profile = await getProfile(user.id);
      const email = profile?.email || user.email || "";
      if (!email) { setLoading(false); return; }
      const jobs = await getMySchedule(email);
      setUpcoming(jobs.filter((j) => j.date >= today));
      setPast(jobs.filter((j) => j.date < today).reverse());
      setLoading(false);
    }
    load();
  }, []);

  return (
    <AppShell title="My Schedule" subtitle="Jobs you are assigned to">
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="grid">
          <div className="card">
            <h2 className="section-title">Upcoming Jobs</h2>
            {upcoming.length === 0 ? (
              <p className="muted">No upcoming jobs assigned yet.</p>
            ) : (
              <div className="grid">
                {upcoming.map((job) => (
                  <JobCard key={job.jobSheetId} job={job} />
                ))}
              </div>
            )}
          </div>

          {past.length > 0 && (
            <div className="card">
              <div
                className="action-row"
                style={{ justifyContent: "space-between", marginBottom: showPast ? 16 : 0 }}
              >
                <h2 className="section-title" style={{ margin: 0 }}>Past Jobs</h2>
                <button
                  className="secondary"
                  style={{ padding: "4px 14px", fontSize: 13 }}
                  onClick={() => setShowPast((v) => !v)}
                >
                  {showPast ? "Hide" : `Show ${past.length}`}
                </button>
              </div>
              {showPast && (
                <div className="grid">
                  {past.map((job) => (
                    <JobCard key={job.jobSheetId} job={job} muted />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

function JobCard({ job, muted = false }: { job: ScheduledJob; muted?: boolean }) {
  return (
    <div
      style={{
        background: muted ? "var(--cream)" : "var(--surface)",
        border: "1px solid var(--line)",
        borderLeft: muted ? "3px solid var(--line)" : "3px solid var(--gold)",
        borderRadius: 10,
        padding: "14px 16px",
        opacity: muted ? 0.75 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {job.client}{job.eventName ? ` — ${job.eventName}` : ""}
          </div>
          {job.venue && (
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
              {job.venue}{job.cityState ? `, ${job.cityState}` : ""}
            </div>
          )}
          <div style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
            <span>📅 {formatDate(job.date)}</span>
            {job.callTime && <span>⏰ Call: {job.callTime}</span>}
            {job.role && <span>🎭 {job.role}</span>}
          </div>
          {job.notes && (
            <div className="muted" style={{ fontSize: 12, marginTop: 8, fontStyle: "italic" }}>
              {job.notes}
            </div>
          )}
        </div>
        <div>
          <span
            className={job.confirmed ? "badge badge-green" : "badge badge-blue"}
            style={{ whiteSpace: "nowrap" }}
          >
            {job.confirmed ? "Confirmed" : "Pending"}
          </span>
        </div>
      </div>
    </div>
  );
}
