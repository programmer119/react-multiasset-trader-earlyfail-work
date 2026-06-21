const profitGivebackPresets = {
    base: {
        ACTIVE_PROFIT_RATE: 50,
        MIN_GIVEBACK_RATE: 15,
        GIVEBACK_RATIO: 0.25,
        MIN_HOLD_DAYS: 3,
        MIN_HIGH_AGO: 0,
    },
    maxprofit: {
        ACTIVE_PROFIT_RATE: 20,
        MIN_GIVEBACK_RATE: 8,
        GIVEBACK_RATIO: 0.30,
        MIN_HOLD_DAYS: 1,
        MIN_HIGH_AGO: 2,
    },
    stable: {
        ACTIVE_PROFIT_RATE: 20,
        MIN_GIVEBACK_RATE: 10,
        GIVEBACK_RATIO: 0.40,
        MIN_HOLD_DAYS: 1,
        MIN_HIGH_AGO: 1,
    },
};

const GetProfitGivebackPreset = (presetName) => {
    if (!presetName) return null;

    const key = String(presetName).toLowerCase();
    const presetKey = key;
    if (!presetKey) return null;

    return profitGivebackPresets[presetKey] || null;
};

module.exports = {
    profitGivebackPresets,
    GetProfitGivebackPreset,
};
