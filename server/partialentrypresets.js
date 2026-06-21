const partialEntryPresets = {
    step3: {
        maxSteps: 3,
        triggerProfitStep: 1,
        maxNewPositions: 0,
    },
    step3cap10: {
        maxSteps: 3,
        triggerProfitStep: 1,
        maxNewPositions: 10,
    },
    step6: {
        maxSteps: 6,
        triggerProfitStep: 1,
        maxNewPositions: 0,
    },
    step6cap10: {
        maxSteps: 6,
        triggerProfitStep: 1,
        maxNewPositions: 10,
    },
    pyramid3: {
        maxSteps: 3,
        triggerProfitRates: [0, 3, 6],
        maxNewPositions: 0,
        oncePerDay: true,
        useBasePriceTrigger: true,
        tranchePercent: 50,
        fixedAddAmountFromFirst: true,
    },
};

const GetPartialEntryPreset = (presetName) => {
    if (!presetName) return null;

    const key = String(presetName).toLowerCase();
    if (!key) return null;

    return partialEntryPresets[key] || null;
};

module.exports = {
    GetPartialEntryPreset,
};
