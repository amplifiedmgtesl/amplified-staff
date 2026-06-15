import type { StaffTimesheet } from "@/lib/types";

// Finalized-aware status badge shared by the Timesheets list and the Dashboard.
// `status='submitted'` is ambiguous on its own — it's the status for both
// crew-leader-built PLANNED rows (worker hasn't entered time) and worker
// submissions. The staff_finalized flag ("I'm done") is the real signal:
//   submitted + !finalized → worker still needs to enter/confirm time
//   submitted +  finalized → worker done, waiting on crew-leader approval
export function staffStatusBadge(t: StaffTimesheet) {
  if (!t.status && t.timesheetId) return <span className="badge badge-green">On Record</span>;
  if (!t.status) return <span className="badge">Pending</span>;
  if (t.status === "submitted" && !t.staffFinalized) return <span className="badge badge-blue">Enter your time</span>;
  if (t.status === "submitted" && t.staffFinalized) return <span className="badge badge-green">Final ✓ — pending approval</span>;
  if (t.status === "approved") return <span className="badge badge-green">Approved</span>;
  if (t.status === "rejected") return <span className="badge badge-red">Rejected</span>;
  return <span className="badge">{t.status}</span>;
}
