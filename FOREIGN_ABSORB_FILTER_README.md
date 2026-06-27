# Foreign Absorb Buy Filter Patch

## What changed

- Added `server/foreignAbsorbFilter.js`.
- Added config options in `server/util.js`.
- Connected the filter in `ProcessLong()` inside `server/tradeutil.js`.

This is a location-A candidate gate. It runs before long signal generation branches, so a stock that fails the filter cannot create a normal long signal.

## Data source

This patch does not write to DB.
It reads halbae dashboard stock-series files directly:

```text
outputs/stock-series/005930.js
outputs/stock-series/440110.js
```

The stock-series folder is hardcoded in `server/util.js` as:

```js
const FOREIGN_ABSORB_SERIES_DIR = 'C:/Users/srhsh/Documents/Codex/2026-06-03/halbae-strategy-designer/outputs/stock-series';
```

No `foreignabsorbseriesdir` PowerShell environment variable is required.

## Enable

```powershell
$env:useforeignabsorbfilter="true"
```

Optional log:

```powershell
$env:foreignabsorbfilterlog="true"
```

## Default filter

On buy day `D`, only foreign ownership data strictly before `D` is used.
This avoids future-data usage.

Default condition:

```text
latest usable foreign data <= D-1
lookback = 20 trading days
price return over lookback <= 0%
foreign ownership share increase >= +0.3%p
foreign ownership share increased on at least 8 days
recent 5-day foreign share change is not <= -0.2%p
exclude 900xxx foreign-listed companies
exclude 99.9%+ foreign ownership outliers
```

## Options

`foreignabsorbseriesdir` is not an environment variable anymore. It is fixed in `server/util.js`.

```text
useforeignabsorbfilter=false
foreignabsorblookbackdays=20
foreignabsorbminshareincreasep=0.3
foreignabsorbminincreasedays=8
foreignabsorbmaxpricereturnpct=0
foreignabsorbcancelrecentdays=5
foreignabsorbcanceldropp=-0.2
foreignabsorbexcluderatep=99.9
foreignabsorbfilterlog=false
```
