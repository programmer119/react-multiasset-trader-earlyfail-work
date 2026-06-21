param(
    [Parameter(Mandatory=$true)][int]$Port,
    [Parameter(Mandatory=$true)][ValidateSet('true','false')][string]$UseMemcached,
    [Parameter(Mandatory=$true)][ValidateSet('true','false')][string]$UseErrorMinuteCloseFilter,
    [string]$StartDate = '2022-10-26',
    [string]$EndDate = '2026-05-29'
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$env:PORT = [string]$Port
$env:usememcached = $UseMemcached
$env:useerrorminuteclosefilter = $UseErrorMinuteCloseFilter
$env:simmulationfunc = 'dailysimulation'
$env:simulationstartdate = $StartDate
$env:simulationenddate = $EndDate
$env:useconsolelog = 'true'

# Intentionally do not set SELF_TRADE. The known-good runs used the default envself path.
$node = 'C:\nvm4w\nodejs\node.exe'
& $node --max-old-space-size=8192 .\server\server.js

