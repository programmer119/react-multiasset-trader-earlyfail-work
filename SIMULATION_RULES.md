# Simulation Rules

These rules exist because repeated invalid simulations wasted time.

## Before Running Any Simulation

1. Verify the actual `defulatConfig` written at the top of the simulation log.
2. Confirm that requested env values are reflected in `defulatConfig`.
   - `topstocklistcount`
   - `trademarktopstocklistcount`
   - `recselper`
   - `usejijibujinsell`
   - `usetrademarkrsi`
   - `useassetupsellcashgate`
   - any newly tested strategy flag
3. If any requested setting differs from the log config, stop and report invalid simulation.
4. Check port allocation before parallel runs. Do not start duplicate ports.
5. If a run fails, classify it before retrying:
   - config mismatch
   - port/process conflict
   - DB missing
   - cache missing
   - real no-data/no-listed-data
   - code exception
6. Do not rerun the same failing command without changing the cause.
7. For topstock sweeps, verify that each resulting log has the requested topstock count in `defulatConfig`.
8. If results are identical across variants that should differ, compare configs and logs before interpreting the result.

## During Simulation

1. For long/full-period runs, check progress at least once per minute.
2. During checks, inspect:
   - current status
   - error logs
   - config mismatch
   - cache/DB missing classification
   - abnormal strategy behavior
3. If a required external service fails during a run, stop the run. Do not keep the run alive through fallback unless the user explicitly asked for fallback testing.
4. After an external-service failure, fix or restart the failed service first, then restart the simulation from the beginning.
5. If behavior differs from the requested logic, stop the run and fix before continuing.
6. Do not hide or normalize anomalies in the report.

## After Simulation

1. Report exact log path.
2. Report actual config summary, not only intended config.
3. Report elapsed time, days, total trades, final return, and monthly average if available.
4. If a baseline comparison is used, report the exact baseline log name.
5. If any warning/error/missing-data event occurred, report it separately from the result.

## Failure / Workaround Memory

1. If a command, simulation, deploy, cache build, viewer action, or analysis fails, record the failure cause.
2. If the task later succeeds by using a different method, record both:
   - the failed method
   - the successful workaround
3. Do not report only the successful path when a failed path happened first.
4. Before retrying a similar task, check this file and avoid known failed methods.
5. If a workaround should become the default method, explicitly mark it as the default.

Known examples:

- PowerShell-heavy command chains repeatedly triggered Windows R6016 popups. Prefer fewer shell calls and Node scripts for bundled checks.
- Topstock sweep once produced invalid repeated results because `util.js` SIMTEST config hardcoded topstock `140`. Always verify actual `defulatConfig` in the log.
- Parallel simulation once failed due to port reservation race. Reserve ports before async availability checks.
- Root-folder `node -e` failed to load app dependencies like `mysql`. Run Node DB scripts from the app folder or use script files in the app folder.
- Cache/data failures must be classified. Do not treat cache miss, DB miss, and real no-data as the same failure.
- A patch that matched nearby Korean comments failed because the file encoding/comment text did not match the expected patch context. Use ASCII key/function context for patches in these files.
- A lookup for `server/stockutil.js` failed because that file does not exist in this app. Use `rg` to locate actual definitions before opening guessed utility paths.
- `git diff` failed in this recovered workspace because the current folders are not inside a Git repository. Use `rg`, syntax checks, and exact file/line verification instead of relying on Git diff here.
- PowerShell `rg` with Unix-style glob arguments such as `*.js analysis*.js` failed with invalid path syntax. Use `rg --files` first or run `rg PATTERN .` from the target directory.
- `db_stocklistdayall` ignores connection errors and may silently produce no output if the callback is not called. For diagnostic DB reads, use a direct `mysql.createConnection` script with explicit error logging.

## Rights / Price Adjustment Rules

1. Do not edit DB price data.
2. Do not use today's daily close for a simulation decision before the day is complete.
3. `ValidStatus(statusstr)` is a live/recent status filter and may be intentionally bypassed in historical autosimulation.
4. For historical correction, use only data that would have been known at that simulation time.
5. If a held stock has a share-count adjustment event after purchase, adjust the in-memory prices used for calculation, not the DB.
6. Apply multiple adjustment events sequentially.
7. Do not change already closed trades.

- 2026-06-09: A diagnostic status-file lookup searched eact-multiasset-trader-earlyfail-work/runlogs for *.status.json and failed because the batch status file was not there. Workaround: read per-run stdout logs directly and verify defulatConfig, logsave path, and strategy event counts from the actual .out.log files.

- 2026-06-09: A crash-rebound comparison was mistakenly run/interpreted with topstock 155 although the working baseline is topstock 140. Default future crash-rebound sims to 	opstocklistcount=140 and verify defulatConfig before reporting. The runner file is 
ew-chat/run_jijibu_markrsi_off_sims_direct.js, not inside the app folder; a guessed app-folder path lookup failed.

- 2026-06-09: PowerShell 
ode -e commands containing JavaScript template literals/backticks were mangled by the shell. Avoid backticks in inline Node snippets or put the diagnostic in a script file.

- 2026-06-09: An inline Node comparison command failed because of an extra closing brace. For repeated diagnostics, prefer a small checked script or keep inline snippets minimal and syntax-check mentally before running.

- 2026-06-10: `usesinglesimulation:false` patch failed once when matching the full Korean-comment line in `server/util.js`. Workaround used a single-token replacement of `usesinglesimulation:false` and then `node --check`. For encoded/commented config lines, patch or replace the ASCII key/value token only and verify with `rg`.

- 2026-06-10: Top500 non-ETF candidate extraction first ran inside the restricted sandbox and produced no output because `db_topstocklistlog` silently drops `getConnection` errors and the remote DB callback never fired. Verify DB connectivity with a short timeout probe, then rerun remote DB reads with network permission.

- 2026-06-10: Single-sim range prefetch patch failed once when matching a block that included encoded Korean comments/trailing spaces. Retry with ASCII-only anchor lines such as `serversimulation start` and `tickers = Array.from(...)`.

- 2026-06-10: During `singlesim_all_memcache_20260610_004921`, remote minute-cache `211.255.25.123:4197` failed at 2026-06-10 02:19:28 KST. The run continued through DB fallback for hours, which invalidated it as a cache-backed simulation. Default rule: when cache/server/network failure appears in a required cache-backed run, stop immediately, resolve the service problem, and restart the simulation from the beginning.

- 2026-06-10: `deploy_minute_cache_supervisor.js` first failed because the remote shell script was joined with semicolons, producing invalid `then;` and `&;` syntax. Workaround/default: build multi-line remote shell scripts with `\n` joins when they include `if/then/else/fi` or background `&`.

- 2026-06-10: After making minute-cache supervisor token mandatory, a restarted single simulation omitted `MINUTE_CACHE_TOKEN` and immediately received cache `401`, then continued through DB fallback. The same invalid run also omitted required env overrides and logged `recselper=50`, `useholdrightspriceadjust=false`, `useassetuprecyclegate=true`. Default: cache-backed runs must set `MINUTE_CACHE_TOKEN` and must verify `defulatConfig` before letting the run continue.

- 2026-06-10: A PowerShell diagnostic that emitted objects inside a `foreach` block and piped after the block failed with `EmptyPipeElement`. Workaround/default: collect objects into an array variable first, then pipe the array.

- 2026-06-10: A cache-backed single simulation was incorrectly run with `singlecandidatefile` empty, so it iterated all non-ETF daily tables instead of the required top500 non-ETF candidate file. Required/default for this task family: set `singlecandidatefile=runlogs/top500_non_etf_candidates_20221026_20260529_20260609162816.json`, verify `[SINGLE_CANDIDATE_FILE] ... tickers:1574` and `[SINGLE_CANDIDATE_FILTER] ... after:1574` in the run log before trusting progress or results.

- 2026-06-10: Progress reporting for that bad single simulation used current `singletest.csv` row count as the denominator, which made the remaining count stay around the pre-existing row count and hid the wrong universe. Required/default: record or infer `initialCsvRows` before starting a run; report `done = currentCsvRows - initialCsvRows`, `total = candidateCount`, `remaining = total - done`.

- 2026-06-10: Restarting the corrected top500 single simulation failed twice before the successful method. Failed methods: `Start-Process` failed with duplicate `Path/PATH` environment keys; `.NET ProcessStartInfo` with redirected stdout/stderr started an unstable/no-log process. Successful/default method: create/use `runlogs/run_top500_1574_memcache.cmd` with all env vars inside it, then launch via `.NET ProcessStartInfo` using `cmd.exe /c ""runlogs/run_top500_1574_memcache.cmd" > "...out.log" 2> "...err.log""` and `UseShellExecute=true`. Verify the process is alive and the log contains the expected `defulatConfig`.

- 2026-06-10: Launching the corrected top500 cmd runner inside the sandbox started and then died at `/checkopenday?date=2026-06-10&nation=KOR` because it needed network access to `211.255.25.125:5000`. Required/default: cache-backed simulations that contact remote DB/fetch/check services must be launched with escalated network permission, using the already-proven cmd runner method.

- 2026-06-10: Before restarting a corrected single simulation, back up the existing `singletest.csv` if it contains wrong-universe results. Do not append corrected top500 results to a CSV polluted by the bad all-non-ETF run.

- 2026-06-10: For exact file-only top500 candidates, changing the runner from DB-intersection mode to file-only mode exposed candidates whose `Oldstocks` response has no `products` array. The run logged an unhandled rejection at `server.js:1812` (`Cannot read properties of undefined (reading 'filter')`). Required/default: keep the file-only 1574 candidate universe, but guard missing daily products with `[SINGLE_CANDIDATE_NO_DAILY] <ticker>` and skip that ticker's daily load instead of crashing.

- 2026-06-10: The same exact-file top500 run failed again in the preloaded daily/minute path at `server.js:1722` when a candidate had a DB error response without `products`. Required/default: every `Oldstocks(..., 'd', ...)` callback in single-sim candidate loading must check `Array.isArray(senddata.products)` before `.filter(...)`; on failure log `[SINGLE_CANDIDATE_NO_DAILY] <ticker>`, skip that candidate, back up the partial CSV, and restart from a clean CSV.

- 2026-06-10: A corrected top500 restart created only a manifest and no stdout/stderr logs because the launcher set `WorkingDirectory` to the app folder while passing a `new-chat/...` relative runner path, doubling the path. Required/default: when launching via `cmd.exe /c`, resolve runner, stdout, stderr, and manifest paths to absolute paths before `ProcessStartInfo`; do not mix app working-directory with root-relative paths.

- 2026-06-10: The 1574 top500 single run was stopped at 405/1574 because remote minute-cache `stats.errors` increased 0 -> 10. Root cause found: ticker `a136510` had daily data but `/minute-data-v2?date=20221026|20260529&tickers=a136510` returned HTTP 503 `minute data load failed`, while `/minute-count-v2` returned HTTP 200 with count 0. The remote `minute-data-v2` path treats missing/failed minute table loads as `failed` instead of caching a null/no-minute result, then the simulator fell back to V1 (`MINUTE_CACHE_SERVER_FALLBACK_V1`). Required/default: missing minute table/no-minute data must be classified and cached as no-data/null, not counted as cache/server error; cache-backed simulations must not continue through V1 fallback.

- 2026-06-10: Fixed the `a136510` minute-cache failure by patching `minute-data-v2` close-data loading to fall back from batch to single-ticker loading and cache missing minute tables as `null` instead of returning 503. Deployed the patched package to 123, restarted supervisor/cache, bootstrapped DB again, and verified `a136510` now returns HTTP 200 with `data.a136510=null` for `20221026` and `20260529`; `/minute-count-v2` remains HTTP 200 with count 0. Restarting the cache server resets in-memory cache, so any interrupted cache-backed simulation must be restarted from a clean run.

- 2026-06-11: Do not restart the 123 minute-cache server casually. The cache server is the in-memory cache itself; restarting it deletes days of accumulated warm cache/RSS state and can waste multi-day simulation warmup work. Before any cache-server/supervisor restart, explicitly report that the memory cache will be lost, get user approval, and prefer non-restart diagnostics or code paths whenever possible. If a restart is unavoidable, record the exact reason, `startedAt` before/after, cache RSS/cacheSize lost, and require all affected cache-backed simulations to restart from clean CSV.

- 2026-06-10: Repeated UI/thread stalls were caused by scanning huge simulation logs with broad patterns, especially common dates such as `20221026` or `20260529`, which produce massive output and make the chat thread sluggish. Required/default: never run full-log `rg`/`Select-String` with common dates or broad alternations on multi-million-line logs. Use `Get-Content -Tail 300`, exact rare error keys such as `MINUTE_CACHE_SERVER_V2_ERR`, or bounded line windows around already-known line numbers. If a broad scan is unavoidable, redirect/count/summarize only and do not stream the full match output into chat.

## Strategy Audit Queue

Treat results from these strategy variants as untrusted until audited for intraday persistence and repeated blocking:

1. `crashreboundsellholdmode=asset|assetindex`
   - Confirmed bad behavior: after a crash day, the flag stays active for the entire next trading day and can repeatedly block the same sell signal every minute.
   - Example: 2024-08-06 Hotel Shilla sell was blocked 172 times and sold next day instead.
   - Do not use previous crash-rebound simulation results.
2. `useassetupbuygate=true`
   - Day-level buy gate. Audit whether full-day buy blocking is intended and whether repeated block logs hide actual unique blocked orders.
3. `useassetupsellcashgate=true`
   - Day-level sold-cash gate. This may be intended, but audit unique blocked/clipped orders versus repeated attempts.
   - Include `assetupsellcashcarrymode=weak1|weak2` in the audit because it intentionally carries prior sell cash locks.
4. `useassetuprecyclegate=true`
   - Recycle/buy interaction gate. Audit whether sell/recycle decisions were suppressed or only buy-side cash usage was restricted.
5. `usepartialentry=step3|step3cap10`
   - Stateful partial-entry logic. Audit one-buy-per-day, added lot size, and whether additional buys are triggered once per intended step only.
6. `useholdrightspriceadjust=true`
   - Not a day-gate strategy, but keep separate. Audit price-adjust events only; this is not part of the repeated intraday block issue.
7. `usecandidatevalidrightsfilter=true`
   - Candidate filter only. Audit for future-data usage and candidate universe drift, not repeated intraday blocking.
- 2026-06-09: crashreboundsellholdmode is disabled by default with usecrashreboundsellhold=false. Even if a mode value remains in env/runner, sell holding must not activate unless usecrashreboundsellhold=true is explicitly set after audit.
