$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$outDir = Join-Path $root 'runlogs'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$memOut = Join-Path $outDir "sim_4025_memcached_$timestamp.out.log"
$memErr = Join-Path $outDir "sim_4025_memcached_$timestamp.err.log"
$dbOut = Join-Path $outDir "sim_4026_dbdirect_$timestamp.out.log"
$dbErr = Join-Path $outDir "sim_4026_dbdirect_$timestamp.err.log"

$ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

$memArgs = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', (Join-Path $root 'run_simulation_once.ps1'),
    '-Port', '4025',
    '-UseMemcached', 'true',
    '-UseErrorMinuteCloseFilter', 'true',
    '-StartDate', '2022-10-26',
    '-EndDate', '2026-05-29'
)

$dbArgs = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', (Join-Path $root 'run_simulation_once.ps1'),
    '-Port', '4026',
    '-UseMemcached', 'false',
    '-UseErrorMinuteCloseFilter', 'true',
    '-StartDate', '2022-10-26',
    '-EndDate', '2026-05-29'
)

$mem = Start-Process -FilePath $ps -ArgumentList $memArgs -WorkingDirectory $root -RedirectStandardOutput $memOut -RedirectStandardError $memErr -PassThru -WindowStyle Hidden
$db = Start-Process -FilePath $ps -ArgumentList $dbArgs -WorkingDirectory $root -RedirectStandardOutput $dbOut -RedirectStandardError $dbErr -PassThru -WindowStyle Hidden

[pscustomobject]@{
    MemcachedPid = $mem.Id
    DbDirectPid = $db.Id
    MemcachedStdout = $memOut
    MemcachedStderr = $memErr
    DbDirectStdout = $dbOut
    DbDirectStderr = $dbErr
}

