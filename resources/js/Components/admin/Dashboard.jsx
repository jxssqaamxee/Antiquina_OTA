import React from "react";
import { Users, Clock, Gauge, ClipboardCheck, AlertTriangle, Building2, UserX, Layers, UserCog, ChevronRight, Activity, PieChart, BarChart3 } from "lucide-react";
import { LiveDutyCard } from "./LiveDuty";
import { AnimatedNumber, AreaChart, DonutChart, RankedBars, Sparkline } from "../charts";

/* ---------- skeletons (same boxes as the real thing, so nothing jumps when data arrives) ---------- */
export const Skel = ({ w, h = 12, r = 8, style }) => <span className="st-skel" aria-hidden="true" style={{ width: w, height: h, borderRadius: r, ...style }} />;

export function KpiSkeleton({ count = 4 }) {
  return (
    <div className="st-kpi-row" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="st-stat st-kpi-card">
          <Skel w={36} h={36} r={10} style={{ marginBottom: 12 }} /><Skel w="45%" h={24} style={{ marginBottom: 8 }} /><Skel w="70%" h={11} /><Skel w="100%" h={34} style={{ marginTop: 14 }} />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 220, title = true }) {
  return (
    <section className="st-card st-chart" aria-busy="true">
      {title && <><Skel w="40%" h={16} style={{ marginBottom: 8 }} /><Skel w="60%" h={11} style={{ marginBottom: 16 }} /></>}
      <Skel w="100%" h={height} r={14} />
    </section>
  );
}

export function TableSkeleton({ cols = 4, rows = 5 }) {
  return (
    <div className="st-table-wrap" aria-busy="true" aria-label="Loading">
      <table className="st-table">
        <thead><tr>{Array.from({ length: cols }).map((_, i) => <th key={i}><Skel w="55%" h={10} /></th>)}</tr></thead>
        <tbody>{Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>{Array.from({ length: cols }).map((__, c) => <td key={c}><Skel w={`${55 + ((r + c) % 3) * 15}%`} h={13} /></td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <>
      <KpiSkeleton />
      <div className="st-chart-row st-2-1"><ChartSkeleton /><ChartSkeleton /></div>
      <div className="st-chart-row st-1-1"><ChartSkeleton height={190} /><ChartSkeleton height={190} /></div>
    </>
  );
}

/* ---------- building blocks ---------- */
export function KpiCard({ icon: Icon, label, value, suffix = "", decimals = 0, hint, series, tone }) {
  return (
    <div className={`st-stat st-kpi-card ch-kpi ${tone ? `is-${tone}` : ""}`}>
      <div className="st-kpi-icon">{Icon && <Icon size={19} strokeWidth={2.2} />}</div>
      <div className="st-kpi-value"><AnimatedNumber value={value} decimals={decimals} suffix={suffix} /></div>
      <div className="st-kpi-label">{label}</div>
      {hint && <div className="st-kpi-hint">{hint}</div>}
      {series?.length > 1 && <Sparkline values={series} />}
    </div>
  );
}

export function ChartCard({ icon: Icon, title, subtitle, children, className = "" }) {
  return (
    <section className={`st-card st-chart ${className}`}>
      <div className="st-chart-head">
        {Icon && <span className="st-chart-icon"><Icon size={16} strokeWidth={2.2} /></span>}
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      </div>
      {children}
    </section>
  );
}

const hasData = (rows) => rows?.some((r) => Number(r.value) > 0);
const Empty = ({ text }) => <p className="st-empty">{text}</p>;

/**
 * Overview for Admin / Coordinator. `data` = response of /api/{role}/overview ({ kpis, accounts? }).
 * `go` jumps to another tab (the "needs attention" rows are shortcuts).
 */
export function OverviewDashboard({ data, scope = "admin", go, liveFetcher }) {
  const k = data?.kpis;
  if (data && !k) return <section className="st-card"><p className="st-empty">{data.message || "No data to show yet."}</p></section>;
  if (!k) return null;
  const c = k.charts || {};
  const weeklyVerified = (c.weekly || []).map((w) => w.verified);
  const attention = [
    { icon: ClipboardCheck, label: "Entries awaiting your review", value: k.awaiting_review, tab: scope === "admin" ? null : "approvals", tone: "warn" },
    { icon: AlertTriangle, label: "Rejected entries to be corrected", value: k.rejected_entries, tone: "bad" },
    { icon: Building2, label: "Trainees not placed in a host yet", value: k.unplaced, tab: scope === "admin" ? null : "trainees", tone: "warn" },
    { icon: UserX, label: "Trainees with no verified hours", value: k.not_started, tab: scope === "admin" ? "reports" : "trainees" },
    ...(scope === "admin" ? [
      { icon: Layers, label: "Students without a section", value: k.unassigned, tab: "enrollments", tone: "warn" },
      { icon: UserCog, label: "Coordinators without a section", value: k.coordinators_unassigned, tab: "coordinators", tone: "warn" },
    ] : []),
  ];
  const a = data.accounts;

  return (
    <>
      <div className="st-kpi-row">
        <KpiCard icon={Users} label="Trainees" value={k.trainees} hint={`${k.completed} completed their OJT`} />
        <KpiCard icon={Clock} label="Verified hours" value={k.verified_hours} decimals={1} hint={`of ${Number(k.required_hours).toLocaleString()} required`} series={weeklyVerified} />
        <KpiCard icon={Gauge} label="Average completion" value={k.avg_percent} decimals={1} suffix="%" hint="across all trainees" />
        <KpiCard icon={ClipboardCheck} label="Awaiting review" value={k.awaiting_review} hint="submitted entries" tone={k.awaiting_review ? "warn" : ""} />
      </div>

      {liveFetcher && <LiveDutyCard fetcher={liveFetcher} onOpen={() => go?.("live")} />}

      <div className="st-chart-row st-2-1">
        <ChartCard icon={Activity} title="Hours per week" subtitle="Last 8 weeks: verified by coordinators vs everything logged">
          {hasData(c.weekly?.map((w) => ({ value: w.logged }))) ? (
            <>
              <div className="st-legend"><span><i className="d1" />Verified</span><span><i className="d2" />Logged</span></div>
              <AreaChart data={c.weekly} series={[{ key: "verified", label: "Verified" }, { key: "logged", label: "Logged", color: "var(--ch-2)" }]} height={240} />
            </>
          ) : <Empty text="No duty hours have been logged in the last 8 weeks." />}
        </ChartCard>
        <ChartCard icon={PieChart} title="Logbook entries" subtitle="By review status">
          {hasData(c.status) ? <DonutChart data={c.status} centerLabel="Entries" /> : <Empty text="No entries yet." />}
        </ChartCard>
      </div>

      <div className="st-chart-row st-1-1">
        <ChartCard icon={BarChart3} title={scope === "admin" ? "Completion by section" : "Completion by trainee"} subtitle="Verified hours as % of required">
          <RankedBars items={scope === "admin" ? c.sections : c.top_trainees} empty="Nothing to compare yet." />
        </ChartCard>
        <ChartCard icon={PieChart} title="Progress bands" subtitle="How far trainees are">
          {k.trainees ? <DonutChart data={c.bands} centerLabel="Trainees" /> : <Empty text="No trainees yet." />}
        </ChartCard>
      </div>

      <ChartCard icon={AlertTriangle} title="Needs attention" subtitle="Click a row to go straight to it">
        <ul className="st-attn">
          {attention.map((r) => {
            const Icon = r.icon;
            const live = r.value > 0 && r.tab;
            return (
              <li key={r.label} className={`${r.value > 0 && r.tone ? `is-${r.tone}` : ""}`}>
                <span className="st-attn-icon"><Icon size={16} /></span>
                <span className="st-attn-label">{r.label}</span>
                <b>{r.value}</b>
                {live ? <button type="button" className="btn st-btn st-attn-go" onClick={() => go?.(r.tab)} aria-label={`Open: ${r.label}`}><ChevronRight size={15} /></button> : <span className="st-attn-spacer" />}
              </li>
            );
          })}
        </ul>
      </ChartCard>

      {a && (
        <ChartCard icon={Users} title="Accounts" subtitle="Everyone who can sign in">
          <div className="st-acct">
            <div><b>{a.trainees}</b><span>Trainees</span></div>
            <div><b>{a.coordinators}</b><span>Coordinators</span></div>
            <div><b>{a.admins}</b><span>Administrators</span></div>
            <div><b>{a.unverified}</b><span>Unverified</span></div>
            <div><b>{a.deactivated}</b><span>Deactivated</span></div>
          </div>
        </ChartCard>
      )}
    </>
  );
}
