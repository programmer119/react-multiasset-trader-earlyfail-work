const profitToLossPresets = {
    conservative: {
        ACTIVE_PROFIT_RATE: 4,
        EXIT_PROFIT_RATE: 0,
        MIN_HOLD_DAYS: 1,
        MIN_HIGH_AGO: 1,
    },
    aggressive: {
        ACTIVE_PROFIT_RATE: 3,
        EXIT_PROFIT_RATE: 0,
        MIN_HOLD_DAYS: 1,
        MIN_HIGH_AGO: 1,
    },
};

const GetProfitToLossPreset = (presetName) => {
    if (!presetName) return null;

    const key = String(presetName).toLowerCase();
    return profitToLossPresets[key] || null;
};

module.exports = {
    profitToLossPresets,
    GetProfitToLossPreset,
};