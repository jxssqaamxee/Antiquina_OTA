---
name: occdl-timetable-handoff
description: Continue the OCCDL (Laravel + React/Vite PWA) weekly duty timetable upgrade in a new chat or account. Use when the person pastes this file and says "continue the timetable upgrade" or names a phase below.
---

# OCCDL timetable upgrade: handoff, phase by phase

How to use: paste this whole file as the first message in a new chat, attach the project zip (`occdl.zip`) and the reference screenshot, then write **"Continue at Phase N"**. Do ONE phase per message so a cut-off never loses work. Finish each phase by listing the files changed.

## Goal (from the owner)
1. Timetable looks like the reference screenshot: Monday to Sunday time grid, hours 7 AM to 10 PM on the left, dashed half-hour lines, today column tinted, red "now" line, zoom control (`-  100%  +`), blue **Download** button top right.
2. Cards are **solid outlined with colour**: 1.5px outline all round, soft flat fill. **No coloured side stripe**, no shadow, no gradient (looks "AI generated" otherwise).
3. Trainees can download the timetable on any phone, and the installed PWA works offline.
4. Use a library (FullCalendar). Deliver a **zip of only the changed files**.

## Project facts
- Laravel API + React 19 / Vite 8 (`resources/js`). Component: `resources/js/Components/shared/WeekTimetable.jsx`, used in `Pages/Profile/ProfilePage.jsx`, `Pages/Coordinator/CoordinatorDashboard.jsx`, `Components/admin/UserDetails.jsx`. Props: `fetcher(week)`, `resetKey`, `interval`.
- API JSON from `app/Services/Academic/TimetableService.php`: `week{start,end,label,prev,next,is_current}`, `hosts[]`, `days[]{date,dow,label,day,is_today,status,expected[],cards[]{slot,in,out,hours,state,late_minutes,expected_in,host,type,status}}`, `totals`, `late_after_minutes`. Backend is unchanged and must stay read-only.
- States and colours: `ontime` green, `late` amber (1-30 min), `very_late` red (>30), `overtime` blue, `absent`/`logged`/`expected` slate. Colour always comes with words.
- `public/sw.js` never caches `/api/*` (private data). Offline data is kept by the app in `localStorage` via `utils/storage.js`; the signed-in user is read from `occ_me` (removed on sign-out).
- `jspdf` is already a dependency. Do not add `html2canvas`; export is drawn on a canvas.
- Build: `npm ci && npx vite build`. Tests: `npm test`.

## Phase 1: Install libraries  (DONE)
`npm i @fullcalendar/react@6.1.22 @fullcalendar/core@6.1.22 @fullcalendar/timegrid@6.1.22`.
Do NOT let npm pick `@fullcalendar/react@7` with core 6: versions must match (all 6.1.22). `@fullcalendar/interaction` is not needed (read-only).

## Phase 2: Shared logic, offline copy, export  (DONE)
- `utils/timetableModel.js`: constants, `fmt12`, `dur`, `buildBlocks(data)` (one block per drawn card, plus dashed "expected" blocks and "absent" blocks), `hourRange`, `fileBase`.
- `utils/timetableCache.js`: `saveTimetable / loadTimetable / clearTimetableCache`, keyed by signed-in user + `resetKey` + week, last 12 weeks kept.
- `utils/timetableImage.js`: `drawTimetable` (canvas), `timetablePng`, `timetablePdf` (jsPDF, landscape A4), `saveOrShare` (Web Share sheet with the file when available, else normal download).

## Phase 3: Calendar component + styles  (DONE)
- `WeekTimetable.jsx` rewritten on FullCalendar `timeGridWeek`: `firstDay=1`, 7 columns, `slotDuration 30m`, `slotLabelInterval 1h`, `nowIndicator`, zoom 60-160% through CSS var `--tt-hour`, Download menu (PNG / PDF), "offline copy" notice.
- `styles/timetable.css` rewritten. Phones keep 7 columns and scroll sideways (`.tt-cal { min-width: 760px }`).

## Phase 4: Build, check, zip  (PARTLY DONE)
Done: `npx vite build` passes. Zip delivered: `occdl-timetable-update.zip` (package files, 3 utils, component, css, rebuilt `public/build`).
**Not done: visual check.** Next chat should: run the app (or a small harness with sample JSON), open the timetable at 1400 px and 390 px wide, and check against the screenshot:
- header day names + dates, today column tint, red now line
- cards have NO left stripe; late card shows "Should start 8:00 AM"
- zoom `-`/`+` changes hour height; Download > PNG and PDF produce a readable file
- dark theme: text contrast of `.tt-ev-in b`
Fix anything off, rebuild, re-zip only changed files.

## Phase 5: PWA polish  (TODO)
1. Bump `VERSION` in `public/sw.js` (`occ-v10` to `occ-v11`) so phones pick up the new build; the build manifest precache already includes the new chunk.
2. Call `clearTimetableCache()` where the app signs out (AuthContext sign-out path) so a shared phone keeps nothing.
3. iPhone Safari: confirm `navigator.share({files})` works from the Download menu on iOS 15+; if the share sheet is refused, fall back to opening the PNG in a new tab (long-press > Save Image).
4. Optional: add an "Install app" hint next to Download when `utils/pwaInstall.js` says the app is not installed.

## Phase 6: Optional extras  (TODO, only if asked)
- Tap a card to open a bottom sheet with full details.
- Day view (`timeGridDay`) switch for narrow phones instead of sideways scrolling.
- Coordinator/admin: "Download all trainees" is NOT built; needs a new read-only endpoint, keep permission checks identical to `TimetableController`.

## Rules for every phase
- Change only what the phase needs; list changed files at the end and zip only those.
- No coloured side border on cards, no gradients, no shadows.
- Never cache `/api` in the service worker.
- Keep wording plain (trainee-facing): "On time", "12 min late", "Absent".
