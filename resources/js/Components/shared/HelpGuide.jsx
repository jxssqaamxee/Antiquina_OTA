import React, { useEffect, useRef, useState } from "react";
import Sheet from "./Sheet";
import {
  HelpCircle,
  X,
  Users,
  Plus,
  FileDown,
  Bell,
  Sun,
  Sunset,
  Moon,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";

// A single, self-contained "how this works" reference for the OJT trainee.
// Content mirrors the actual app logic 1:1 (host client schedules,
// shift-coverage rules, real-time progress, PDF export gating) so it never
// tells the trainee something the code doesn't actually do. Shared by both
// the always-available Help (?) button and the one-time onboarding
// walkthrough shown on first sign-in.
function GuideContent() {
  return (
    <>
      <p className="help-intro">
        This app is your digital Daily Time Record (DTR). It counts your OJT hours
        toward your required total as the time actually passes, keeps your record
        safe in your account, and creates a signable PDF report for your coordinator.
      </p>

      <section className="help-section">
        <h3><Users size={14} /> 1. Set up first</h3>
        <ul>
          <li>Open the setup sheet and enter your <strong>Trainee name</strong> (letters only) and your <strong>Required hours</strong> (a whole number, 1 to 2000). Both are printed on the PDF.</li>
          <li>Add a <strong>Host client</strong> — the office or company you are deployed to — and pick its type:
            <ul>
              <li><strong>Public</strong> — Mon to Thu, 8:00 AM to 5:00 PM</li>
              <li><strong>Private</strong> — Mon to Fri, 7:00 AM to 6:00 PM</li>
              <li><strong>Custom</strong> — you choose the days and the time in and out</li>
            </ul>
          </li>
          <li>You can edit a host client's schedule at any time. A host client that is used by a saved entry <strong>cannot be removed</strong> until those entries are deleted.</li>
        </ul>
      </section>

      <section className="help-section">
        <h3><Plus size={14} /> 2. Logging a day</h3>
        <ul>
          <li>Tap <strong>+ Add day</strong>, pick the date, the <strong>host client</strong> (required) and the entry type: <strong>Regular</strong>, <strong>Evening</strong> or <strong>Overtime</strong>.</li>
          <li>Choose the <strong>shift coverage</strong>:
            <span className="help-inline-icons">
              <Sun size={12} /> Morning only, <Sunset size={12} /> Afternoon only, <Moon size={12} /> Evening only,
              Afternoon and Evening, or Whole day.
            </span>
          </li>
          <li>Only the options that fit your host client's hours are shown. For today, "Morning" and "Whole day" disappear once it is past 12:00 PM.</li>
          <li>The 12:00 to 1:00 PM lunch break is not counted. Time ranges cannot overlap another entry on the same date.</li>
          <li>Use <strong>Edit</strong> to correct an entry or <strong>Delete</strong> to remove it. Today's entries stay on the Logbook tab so you can fix them; from the next day they move to the <strong>History</strong> tab, where you can search and filter by day, week or month.</li>
        </ul>
      </section>

      <section className="help-section">
        <h3><ShieldCheck size={14} /> 3. Hours count in real time</h3>
        <ul>
          <li>Hours are credited only as the clock passes. An entry for a time that has not arrived yet adds <strong>0 hours</strong>, then grows minute by minute while the shift runs. You can never claim hours you have not worked.</li>
          <li>Each entry shows a badge: <strong>Scheduled</strong> (not started), <strong>In progress</strong> (running now), <strong>Complete</strong> (reached the standard hours for its coverage: Morning 4h, Afternoon 4h, Evening 3h) or <strong>Short</strong> with the missing time, such as −1h 00m.</li>
          <li>The progress ring on the Logbook tab shows hours logged, hours still required and overtime.</li>
        </ul>
      </section>

      <section className="help-section">
        <h3><FileDown size={14} /> 4. Reports and the PDF</h3>
        <ul>
          <li>The <strong>Reports</strong> tab shows live totals by Morning, Afternoon and Evening, by host client and by entry type, how many days were complete or short, and a detailed day-by-day log.</li>
          <li>On the Logbook tab, choose a <strong>report type</strong> and tap <strong>Export PDF report</strong>:
            <ul>
              <li><strong>Daily</strong> — one row per entry with the exact time record, host client, hours, status and your task notes</li>
              <li><strong>Weekly</strong> or <strong>Monthly</strong> — one row per period with days logged, hours per shift and days complete</li>
            </ul>
          </li>
          <li>Every report has the trainee details, summary cards with a progress bar, the duty log, an hours breakdown by host client and by shift, and signature lines for you and your supervisor.</li>
          <li>Export is <strong>locked while a shift is still running</strong> and unlocks when it ends. Entries that have not started yet are left out of the report.</li>
        </ul>
      </section>

      <section className="help-section">
        <h3><Bell size={14} /> 5. Notifications</h3>
        <ul>
          <li>The bell keeps a history of your milestones (25%, 50%, 75% and 100% of your required hours), shift reminders and warnings.</li>
          <li>On your host client's working days you get two reminders: <strong>shift start</strong> about 20 minutes before time in, and <strong>clock-out</strong> about 10 minutes before time out (skipped if you already logged your time out).</li>
          <li>Tap <strong>Turn on alerts</strong> in the bell panel so reminders reach your phone <strong>even when the app is closed</strong>. On iPhone, first add OCCDL to your Home Screen (Share, then Add to Home Screen) and open it from there.</li>
          <li>Reminders follow the host client you logged most recently.</li>
        </ul>
      </section>

      <section className="help-section">
        <h3><ShieldCheck size={14} /> 6. Your data</h3>
        <ul>
          <li>Your logbook is saved to <strong>your account</strong>, so you can sign in on another phone or browser and find the same record.</li>
          <li>It keeps working offline. Changes are stored on your device and sent to your account when the connection returns. The footer shows "Saved to your account" once it is synced.</li>
          <li>Still export a PDF regularly as your own copy of the official record.</li>
        </ul>
      </section>
    </>
  );
}

// Always-available reference, opened from the (?) button in the app bar.
export function HelpButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setOpen(true)}
        aria-label="How to use the Duty Log"
        title="How to use the Duty Log"
      >
        <HelpCircle size={19} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="How the Duty Log works" labelId="help-title">
        <GuideContent />
      </Sheet>
    </>
  );
}

// One-time walkthrough shown the first time an account signs in. The trainee
// has to scroll to the end before Skip / Done unlock, so nobody misses how
// host clients, adding a day and the PDF export work.
export function OnboardingGuide({ open, onDone }) {
  const [reachedBottom, setReachedBottom] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!open) { setReachedBottom(false); return undefined; }
    const t = setTimeout(() => {
      const el = bodyRef.current?.closest(".sheet-body");
      if (el && el.scrollHeight - el.clientHeight <= 4) setReachedBottom(true);
    }, 60);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const el = bodyRef.current?.closest(".sheet-body");
    if (!el) return undefined;
    const on = () => { if (el.scrollHeight - el.scrollTop - el.clientHeight <= 6) setReachedBottom(true); };
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, [open]);

  return (
    <Sheet
      open={open}
      onClose={() => {}}
      dismissible={false}
      title="Welcome! How the Duty Log works"
      labelId="onboarding-title"
      footerClass="is-2-1"
      footer={
        <>
          {!reachedBottom && (
            <span className="onboarding-hint"><ChevronDown size={14} /> Scroll down to read the full guide</span>
          )}
          <button type="button" className="btn" disabled={!reachedBottom} onClick={onDone}>Skip</button>
          <button type="button" className="btn btn-primary" disabled={!reachedBottom} onClick={onDone}>Done</button>
        </>
      }
    >
      <div ref={bodyRef}>
        <GuideContent />
        <p className="onboarding-end-marker">
          That's everything — you're ready to set up your host client and start logging your hours.
        </p>
      </div>
    </Sheet>
  );
}

export default HelpButton;
