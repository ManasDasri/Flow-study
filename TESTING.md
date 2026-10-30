# Validation and coverage

The UI refinement has repeatable checks across every shipped JavaScript module, the HTTP server, both HTML pages, all five themes, and the supplied database schemas. This is a coverage inventory, not a claim that every possible state or production environment has been tested.

## Run the checks

```sh
npm ci
npm test
npm start
```

In another terminal, use Playwright CLI with an installed browser. Start the browser at your local server before running the suite; the suite uses that page's origin.

```sh
playwright-cli open http://localhost:3000/login.html
playwright-cli run-code --filename=scripts/ui-smoke.js
playwright-cli run-code --filename=scripts/tools-layout.js
```

The browser suite intercepts Supabase and provider traffic. It uses synthetic media, not a camera or microphone. Screenshots in `assets/ui-preview` use these fixtures. Runtime screenshots go to the ignored `output/playwright` directory.

Run `tools-layout.js` in the same session after the smoke suite. It checks the continuous timer/tools panel at ten viewport sizes, including 1366x600 and 1440x500, verifies that only the content list needs to scroll, checks that the composer and focus-mode controls fit, and exercises Shift+Enter versus Enter. It also verifies that the outlined `f.` SVG favicon loads. The favicon uses the same Instrument Sans SemiBold letterforms as the wordmark and has no runtime font dependency.

Database checks require an isolated local PostgreSQL server owned by a test superuser named `flow_test`. They connect only to `127.0.0.1`, create disposable `flow_ui_*` databases, and remove those databases afterward. Do not point these checks at Supabase or a shared database.

```sh
FLOW_TEST_PGPORT=55439 node --test scripts/sql-integration.test.cjs
```

## Coverage inventory

| Area | Exercised behavior |
| --- | --- |
| `login.js`, `login.html` | Native form validation, Enter submission, service rejection recovery, signup, theme persistence, malformed stored login, logout |
| `app.js`, `index.html` | Room code/PIN validation, wrong PIN, rejected join, bounded code collisions, host/join exclusion, invite clipboard fallback, media links, leave cancellation and confirmation |
| `feedback.js` | Inline feedback, toasts, dialog focus containment, Escape, focus restoration, inert background |
| `ui.js` | Task reconciliation, assignment, completion, pending controls, empty states, text escaping, presence cards, progress |
| `tasks.js` | Add/update/delete rejection, empty RLS write results, rollback, preserved draft text, in-flight duplicate prevention, task-load retry |
| `chat.js` | Normal sends, failed delivery, AI errors and success, question retry, hostile/long text, bounded history |
| `timer.js` | Start/pause/reset, all modes, settings bounds, rejected malformed sync, completion, wall-time catch-up after simulated throttling |
| `presence.js`, `profile.js` | Local/remote status, focus transitions, profile edits/failure recovery, session completion and stats refresh |
| `socket.js` | Subscription state, tracking rejection/recovery, participant leave/rejoin grace period, disconnect and stale callback suppression |
| `rtc.js` | Denied-media fallback, local offer and answer negotiation, two received synthetic tracks, peer removal, track shutdown, late peer creation cancellation |
| `supabase.js`, `utils.js` | Request deadlines and caller cancellation, corrupted storage, Unicode escaping, supported YouTube URLs and lookalike rejection |
| CSS and HTML | Browser-rendered checks at 320, 390, 768, 1024, and 1440px; horizontal overflow, primary text contrast in all themes, reduced motion, desktop/mobile screenshots |
| `server.js` | Static assets and missing/private paths, malformed/type/size boundaries, unconfigured providers, rate limiting, local concurrent static requests |
| SQL | Legacy TEXT and current UUID fixtures, data preservation, repeat application, PIN checks, task isolation, author validation, publication preservation |
| Dependency lockfile | `npm audit --omit=dev`: zero reported vulnerabilities at validation time |

## Local stress results

The successful browser runs rendered 500 task rows through five reconciliations, delivered 1,000 fixture messages while retaining the most recent 300, and created 16 simulated partner tiles. Local WebRTC reached `connected` and received one audio and one video track. The suite finished without uncaught browser errors.

The HTTP checks completed 100 concurrent local static requests. These small, isolated workloads validate behavior under those conditions. They are not a benchmark of hosted capacity, a cross-network media test, or a sustained production load test. Timings depend on the test machine.

## Supabase compatibility

The supplied older schema defines `verify_room_pin`, TEXT room references, and permissive task policies. The current app expects `join_room`, participant membership, profiles, and task assignment.

For an existing database, review and stage these migrations in order:

1. `sql/002_profiles.sql`
2. `sql/003_task_assignment.sql`
3. `sql/004_room_access_compatibility.sql`

Migration 004 preserves existing rows and publications, maps recognized legacy room-code references to UUID strings, backfills membership for existing task/session authors, and replaces legacy task policies with participant checks. Unknown room references remain intact and require review. Historical author fields come from the old schema and should be reviewed before relying on their backfilled memberships.

`sql/schema.sql` is a destructive bootstrap script, not an upgrade path for an existing database. No migration was executed against the live Supabase project during this work.

## Remaining integration checks

- Validate the actual deployed schema and policies rather than assuming the shared SQL exactly matches it.
- Exercise real authentication/email delivery, live database mutations, and Supabase subscription recovery on a staging project.
- Test physical camera/microphone permissions and calls across separate devices and restrictive networks, using configured TURN credentials.
- Verify private Realtime authorization separately: table RLS and the join RPC do not establish private Broadcast-channel authorization by themselves.
- Check paid AI/TURN success paths with staging credentials and agreed request limits.
- Run Safari/Firefox, assistive-technology, long-duration, and hosted load checks before making broader compatibility/capacity claims.
