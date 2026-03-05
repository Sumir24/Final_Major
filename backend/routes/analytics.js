const express = require('express');
const router = express.Router();

/**
 * Helper to calculate performance metrics from a raw list of trades.
 * Expects trades in format: [{ time, type: 'buy'|'sell', price }, ...]
 */
function calculateMetrics(trades, initialBalance = 10000) {
    if (!trades || trades.length === 0) {
        return {
            winRate: 0,
            maxDrawdown: 0,
            sharpeRatio: 0,
            totalReturn: 0,
            totalTrades: 0,
            equityCurveData: []
        };
    }

    const sortedTrades = [...trades].sort((a, b) => a.time - b.time);
    let runningBalance = initialBalance;
    let peakBalance = initialBalance;
    let maxDrawdown = 0;

    let winningTrades = 0;
    let closedTradesCount = 0;

    // For Sharpe Ratio (simplified daily returns proxy)
    const returns = [];

    const equityCurveData = [{
        time: sortedTrades[0] ? sortedTrades[0].time - 3600 : Date.now() / 1000,
        value: initialBalance
    }];

    let openPosition = null;

    sortedTrades.forEach(trade => {
        if (!trade.type) return;
        const type = trade.type.toLowerCase();

        if (openPosition) {
            if (type !== openPosition.type) {
                // Determine percentage return for this trade
                let returnPct = 0;
                if (openPosition.type === 'buy') {
                    returnPct = (trade.price - openPosition.price) / openPosition.price;
                } else { // sell (short)
                    returnPct = (openPosition.price - trade.price) / openPosition.price;
                }

                const pnlAmount = runningBalance * returnPct;
                runningBalance += pnlAmount;
                closedTradesCount++;

                if (pnlAmount > 0) winningTrades++;
                returns.push(returnPct);

                // Drawdown calculation
                if (runningBalance > peakBalance) {
                    peakBalance = runningBalance;
                }
                const currentDrawdown = (peakBalance - runningBalance) / peakBalance;
                if (currentDrawdown > maxDrawdown) {
                    maxDrawdown = currentDrawdown;
                }

                // Add to equity curve
                equityCurveData.push({
                    time: trade.time,
                    value: runningBalance
                });

                openPosition = null;
            }
        } else {
            openPosition = trade;
        }
    });

    const winRate = closedTradesCount > 0 ? (winningTrades / closedTradesCount) * 100 : 0;
    const totalReturn = ((runningBalance - initialBalance) / initialBalance) * 100;

    // Simplified Sharpe Ratio (assuming risk-free rate = 0, no annualization multiplier for simplicity here)
    let sharpeRatio = 0;
    if (returns.length > 0) {
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);

        // Annualize it roughly (assuming avg holding period is short, multiplying by sqrt(252) is standard for daily)
        // For a general playground, we just provide the raw ratio of trade returns
        if (stdDev > 0) {
            sharpeRatio = avgReturn / stdDev;
        }
    }

    return {
        winRate: winRate.toFixed(2),
        maxDrawdown: (maxDrawdown * 100).toFixed(2),
        sharpeRatio: sharpeRatio.toFixed(2),
        totalReturn: totalReturn.toFixed(2),
        totalTrades: closedTradesCount,
        finalBalance: runningBalance.toFixed(2),
        equityCurveData
    };
}

router.post('/calculate', (req, res) => {
    try {
        const { trades, initialBalance } = req.body;

        if (!trades || !Array.isArray(trades)) {
            return res.status(400).json({ error: "Invalid trades array provided" });
        }

        const metrics = calculateMetrics(trades, initialBalance || 10000);
        res.json(metrics);

    } catch (error) {
        console.error("Error calculating analytics:", error);
        res.status(500).json({ error: "Failed to calculate performance metrics" });
    }
});

module.exports = router;
