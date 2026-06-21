# Simulation Execution Method

Purpose: run repeatable comparison simulations without changing source config blocks or `SELF_TRADE`.

Canonical config:
`C:\Users\srhsh\Documents\Codex\2026-05-30\new-chat\simulation-run-config.json`

Mandatory wrapper:
`C:\Users\srhsh\Documents\Codex\2026-05-30\new-chat\run_from_sim_config.ps1`

Rules:
- Do not set `SELF_TRADE`; let the project default/current config resolve `envself`.
- Do not run `node server/server.js` directly for tests.
- Do not use `-DryRun` for actual simulation tests. It is only for wrapper syntax/config validation.
- Do not run through chained `cmd.exe set A=...&& set B=...&& node ...`.
- Use `run_from_sim_config.ps1` so env setup, port selection, stdout/stderr, and manifest paths are repeatable and visible.
- Only vary `PORT`, `usememcached`, and explicitly requested test flags.
- Keep working directory at the copy root:
  `C:\Users\srhsh\Documents\Codex\2026-05-30\new-chat\react-multiasset-trader-earlyfail-work`
- Remote DB/memcached access requires escalated execution in Codex tool calls. If a probe fails with `EACCES`, rerun with escalation instead of changing execution logic.

Current comparison command shape:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File C:\Users\srhsh\Documents\Codex\2026-05-30\new-chat\run_from_sim_config.ps1 `
  -Mode memcached
```

DB direct pair:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File C:\Users\srhsh\Documents\Codex\2026-05-30\new-chat\run_from_sim_config.ps1 `
  -Mode dbdirect
```

Short verification checklist:
- stdout contains `InitServer`.
- stdout contains `dailysimulation start`.
- stdout contains at least one daily result line.
- stdout contains `complete dailysimulation`.
- stdout contains `raptime`.
- Stop verification-only server processes after confirmation.

Analysis execution rules:
- If a Node analysis script reads remote DB or memcached, run it with escalated execution on the first attempt.
- Do not first try remote DB/memcached scripts without escalation.
- Do not save JSON with PowerShell redirection or `Set-Content` for analysis artifacts.
- Prefer Node `fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8')`.
- When reading generated JSON, strip BOM before `JSON.parse`:

```js
const data = JSON.parse(text.replace(/^\uFEFF/, ''));
```

Successful analysis route:

```powershell
node .\analyze_dndpharm_exit.js
```

Codex tool requirement: use escalated execution because the script reads remote MySQL and memcached.

Successful viewer restart route:

```cmd
cmd.exe /c "start /B C:\nvm4w\nodejs\node.exe server.mjs > viewer.out.log 2> viewer.err.log"
```

Use this when PowerShell `Start-Process` fails with duplicate `Path`/`PATH`.
