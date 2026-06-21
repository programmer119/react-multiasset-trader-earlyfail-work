const earlyProfitLockPresets = {
    fast: {
        ACTIVE_PROFIT_RATE: 8,
        GIVEBACK_POINT: 4,
        MIN_HOLD_DAYS: 1,
        MIN_HIGH_AGO: 0,
        REQUIRE_CLOSE_TIME: false,
    },
    wait: {
        ACTIVE_PROFIT_RATE: 15,
        GIVEBACK_POINT: 8,
        MIN_HOLD_DAYS: 1,
        MIN_HIGH_AGO: 0,
        REQUIRE_CLOSE_TIME: false,
    },
    closefast: {
        ACTIVE_PROFIT_RATE: 10,
        GIVEBACK_POINT: 5,
        MIN_HOLD_DAYS: 1,
        MIN_HIGH_AGO: 0,
        REQUIRE_CLOSE_TIME: true,
    },
    high20: {
        ACTIVE_PROFIT_RATE: 20,
        GIVEBACK_POINT: 8,
        MIN_HOLD_DAYS: 1,
        MIN_HIGH_AGO: 0,
        REQUIRE_CLOSE_TIME: false,
    },
    high30: {
        ACTIVE_PROFIT_RATE: 30,
        GIVEBACK_POINT: 10,
        MIN_HOLD_DAYS: 1,
        MIN_HIGH_AGO: 0,
        REQUIRE_CLOSE_TIME: false,
    },
    high40: {
        ACTIVE_PROFIT_RATE: 40,
        GIVEBACK_POINT: 12,
        MIN_HOLD_DAYS: 1,
        MIN_HIGH_AGO: 0,
        REQUIRE_CLOSE_TIME: false,
    },
};

const GetEarlyProfitLockPreset = (presetName) => {
    if (!presetName) return null;

    const key = String(presetName).toLowerCase();
    if (!key) return null;

    return earlyProfitLockPresets[key] || null;
};

module.exports = {
    earlyProfitLockPresets,
    GetEarlyProfitLockPreset,
};
