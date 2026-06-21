# Minute Cache Server Method

## Purpose

Remote RAM cache for simulation minute close data.

The server reads minute close data from the existing DB structure without changing DB tables, then caches by:

```text
db_id + date + ticker
```

This is intended to let several simulation processes share one RAM cache instead of each process hitting the remote DB separately.

## File

```text
server/minute-cache-server.js
```

## Verified Local Syntax Check

```powershell
node --check .\server\minute-cache-server.js
```

## Verified Local Health Route

Use PowerShell job route. Do not use `Start-Process -FilePath node` on this machine because it can fail with `Path/PATH` duplicate environment-key error.

```powershell
$job = Start-Job -ScriptBlock {
    Set-Location 'C:\Users\srhsh\Documents\Codex\2026-05-30\new-chat\react-multiasset-trader-earlyfail-work'
    node server\minute-cache-server.js
}
Start-Sleep -Seconds 2
Invoke-RestMethod -Uri 'http://127.0.0.1:4097/health'
Stop-Job $job
Remove-Job $job -Force
```

## API

```text
GET  /health
GET  /status
POST /clear
POST /invalidate
GET  /minute-close?db_id=&date=yyyymmdd&tickers=a005930,a000660
```

`/minute-close` returns close arrays encoded as `float32-base64`.

## Runtime Env

```text
MINUTE_CACHE_PORT=4097
MINUTE_CACHE_CHUNK_SIZE=45
MINUTE_CACHE_CONCURRENCY=4
MINUTE_CACHE_MAX_TICKERS=400
```

## Deployment Note

The memcached address only identifies the remote service endpoint. Starting this Node process on that machine requires a separate shell execution path such as SSH, RDP, PM2, NSSM, or an existing deploy script.
