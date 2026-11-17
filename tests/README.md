# The Living Planner: tests

Browser tests for the whole planner. They build the app, open it in a real browser (phone and iPad sizes),
click through it the way a person would, and check what shows up and what gets saved.

Nothing here touches the real database. The test build talks to a stand-in (`fake-db.cjs`) that behaves like
Supabase and **rejects any write the real database would reject** (a column or table that doesn't exist, a
missing required value), using the real table layout saved in `schema.json`.

## Running them

```
npm test                        # everything (about 10 minutes)
npm test -- calendar            # only specs whose name contains "calendar"
npm test -- --update finance    # accept what finance shows now as the new expected result
npm test -- --no-build core     # reuse the last build
```

Needs Playwright 1.63 and its Chromium: `npm install --no-save playwright@1.63.0 && npx playwright install chromium`.

## How a change goes live

1. Push to the **dev** branch.
2. GitHub runs every test (`.github/workflows/test-and-release.yml`).
3. If they all pass, GitHub moves **main** (the live website) and **capacitor** (the App Store build) to that commit.
   If any fail, nothing goes live and the run keeps the screenshots and logs.

Pushing straight to main still works but skips the tests, so don't, except to undo a bad release.

## What's here

| File | What it is |
|---|---|
| `run.cjs` | Builds the app, starts the stand-in database, runs each spec, compares with its snapshot |
| `fake-db.cjs` | The stand-in for Supabase (sign-in, tables, functions) and a server for the built app |
| `schema.json` | The real planner tables: columns (`!` = required) and unique keys. **Update it whenever a column or table is added** |
| `harness.cjs` | Shared helpers: signed-in session, database helpers, the simulated iPhone bridge |
| `specs/` | One script per area. Each reports an object of what it saw |
| `snapshots/` | The expected result for each spec. A difference fails the run |
| `edge/` | Checks for the server functions (run by hand with Deno) |

A spec fails when it crashes, reports a failed check or a page error, differs from its snapshot, or the
stand-in database rejected one of its writes.

## The specs

| Spec | Covers |
|---|---|
| `every-page` | Opens all 50 pages and tabs on phone and iPad: no errors, nothing wider than the screen |
| `core` | Home numbers, task groups, repeating tasks, calendar basics, habits |
| `calendar-times`, `calendar-blocks`, `calendar-month` | Start/end times, blocks and dragging, month view, locations |
| `goals`, `score`, `life-score`, `score-trend`, `growth` | Goals and steps, Life Score math and history |
| `finance`, `savings`, `calculator` | Budgets, expenses, credit cards, savings funds, calculator |
| `reflections`, `reflection-sync`, `verse-of-the-day` | Faith: reflections, syncing between devices, daily verse |
| `sleep`, `focus`, `mindmap`, `recipes` | Wellness sleep log, focus timer, mind map, recipes and shopping list |
| `sync`, `account` | Data syncing between devices, profile, time zone, sign-out clearing |
| `free-vs-pro`, `upgrade-links` | What Free can and can't do, upgrade sheet and website links |
| `welcome` | Signed-out welcome, tour, sign-up and sign-in screens |
| `app-store-shell`, `app-store-signed-out`, `app-store-purchases` | The iPhone/iPad app: sign-in storage, Apple reminders, backup, no web prices, in-app purchase |
| `app-store-calendar` | Apple Calendar in the iPhone/iPad app (simulated calendar): connect, Day / Month / Home, edit, delete, move, save to a calendar, hide, turn off, access denied, and that the website shows none of it |

## Adding or changing a test

- Copy a small spec (`growth.cjs`), drive the page, put what you saw in an object, call `H.report(object)`.
- Use a fixed clock (`ctx.clock.install`) so results don't change with the date.
- Don't record exact pixel positions or timestamps; record what matters about them (true/false, counts, text).
- Run `npm test -- --update <name>`, read the new snapshot, and commit both files.
- `// @build iap` in a spec's first lines runs it against the build with in-app purchases turned on.
