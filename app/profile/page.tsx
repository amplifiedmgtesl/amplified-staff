"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { supabase } from "@/lib/supabase/client";
import { getProfile, upsertProfile } from "@/lib/db";
import type { Profile } from "@/lib/types";

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", address: "", city: "", state: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const p = await getProfile(user.id);
      if (p) {
        setProfile(p);
        setForm({ fullName: p.fullName, email: p.email || user.email || "", phone: p.phone, address: p.address, city: p.city, state: p.state });
      } else {
        setForm((f) => ({ ...f, email: user.email || "" }));
        setProfile({ id: user.id, role: "staff", employeeKey: null, fullName: "", email: user.email || "", phone: "", address: "", city: "", state: "" });
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    await upsertProfile({ ...profile, ...form });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AppShell title="My Profile" subtitle="Keep your contact information up to date">
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <form onSubmit={handleSave} style={{ maxWidth: 600 }}>
          <div className="card">
            <h2 className="section-title">Contact Information</h2>
            <div className="grid">
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Full Name</label>
                <input value={form.fullName} onChange={set("fullName")} placeholder="Full Name" required />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Email</label>
                <input type="email" value={form.email} onChange={set("email")} placeholder="Email" />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Phone</label>
                <input value={form.phone} onChange={set("phone")} placeholder="Phone" />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Address</label>
                <input value={form.address} onChange={set("address")} placeholder="Street address" />
              </div>
              <div className="grid2">
                <div>
                  <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>City</label>
                  <input value={form.city} onChange={set("city")} placeholder="City" />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>State</label>
                  <select value={form.state} onChange={set("state")}>
                    <option value="">— Select —</option>
                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="action-row">
                <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save Profile"}</button>
                {saved && <span style={{ color: "var(--olive)", fontSize: 14 }}>✓ Saved</span>}
              </div>
            </div>
          </div>
        </form>
      )}
    </AppShell>
  );
}
