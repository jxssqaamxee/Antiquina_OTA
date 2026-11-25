import React from "react";

const SIZE = 132;
const STROKE = 12;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

// Compact progress ring that sits on the hero card (white on the accent gradient).
export default function ProgressRing({ percent = 0, complete = false, children }) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  const offset = CIRC - (clamped / 100) * CIRC;
  return (
    <div className={`ring${complete ? " is-complete" : ""}`} role="img" aria-label={`${Math.round(clamped * 10) / 10} percent of required hours logged`}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle className="ring-track" cx={SIZE / 2} cy={SIZE / 2} r={R} strokeWidth={STROKE} fill="none" />
        <circle
          className="ring-progress" cx={SIZE / 2} cy={SIZE / 2} r={R} strokeWidth={STROKE} fill="none"
          strokeDasharray={CIRC} strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
