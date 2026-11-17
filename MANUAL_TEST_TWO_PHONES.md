# Manual test: two phones, one logbook
Use the same account on Phone A and Phone B (both online, app open on the Logbook page).
1. A: add a duty day. Wait 5 s. B: reopen or refresh the app. Expect: the entry appears on B.
2. Put B in airplane mode. B: add a different duty day. A: add another day (online, saves).
3. B: turn the network back on. Expect: B shows "Another device changed this logbook. Your last edit is kept in recovery." with "Restore my last edit". B now shows A's data.
4. B: tap "Restore my last edit". Expect: B's day returns and syncs. Refresh A: it appears there.
5. Close the app on A right after an edit (swipe away). Reopen. Expect: no false conflict toast, the edit is still there.
6. Sign out on B, sign in as another user. Expect: none of the first user's data.
7. Server rejection: not easy to trigger by hand; covered by SyncTest and tests/js/sync.test.mjs.
