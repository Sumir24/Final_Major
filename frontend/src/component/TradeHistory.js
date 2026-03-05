import React, { useState, useEffect } from 'react';

const TradeHistory = ({ trades }) => {
    const [tradeLog, setTradeLog] = useState([]);
    const [initialBalance, setInitialBalance] = useState(10000); // Default $10,000 account

    const formatTime = (ts) => new Date(ts * 1000).toLocaleString();
    const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

    // Calculate PnL whenever trades update
    useEffect(() => {
        if (!trades || trades.length === 0) {
            setTradeLog([]);
            return;
        }

        const sortedTrades = [...trades].sort((a, b) => a.time - b.time);
        const log = [];
        let openPosition = null;
        let runningBalance = initialBalance;

        sortedTrades.forEach(trade => {
            if (!trade.type) return;
            const type = trade.type.toLowerCase();

            if (openPosition) {
                // Try to close position
                if (type !== openPosition.type) {
                    // PnL Calculation based on Percentage Return (Compounding)
                    // Buy: (Exit - Entry) / Entry
                    // Sell: (Entry - Exit) / Entry

                    let returnPct = 0;
                    if (openPosition.type === 'buy') {
                        returnPct = (trade.price - openPosition.price) / openPosition.price;
                    } else {
                        returnPct = (openPosition.price - trade.price) / openPosition.price;
                    }

                    const pnlAmount = runningBalance * returnPct;
                    runningBalance += pnlAmount;

                    log.push({
                        entryTime: openPosition.time,
                        exitTime: trade.time,
                        entryPrice: openPosition.price,
                        exitPrice: trade.price,
                        type: openPosition.type,
                        pnl: pnlAmount,
                        balance: runningBalance,
                        returnPct: returnPct * 100 // Store as percentage
                    });
                    openPosition = null; // Position closed
                }
            } else {
                // Open new position
                openPosition = trade;
            }
        });

        setTradeLog(log);
    }, [trades, initialBalance]);

    return (
        <div style={{
            flex: '0 0 500px', // Widened to fit new column
            border: '1px solid #333',
            background: '#1E1E1E',
            color: '#DDD',
            display: 'flex',
            flexDirection: 'column',
            height: '100%'
        }}>
            <div style={{
                padding: '10px',
                borderBottom: '1px solid #333',
                background: '#252526',
                fontWeight: 'bold',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span>Account History</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 'normal' }}>
                    <label title="Starting Capital">Initial Balance ($):</label>
                    <input
                        type="number"
                        value={initialBalance}
                        onChange={(e) => setInitialBalance(Number(e.target.value))}
                        style={{ width: '80px', background: '#333', color: '#FFF', border: '1px solid #555', padding: '2px' }}
                    />
                </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #444', textAlign: 'left' }}>
                            <th style={{ padding: '5px' }}>Type</th>
                            <th style={{ padding: '5px' }}>Entry</th>
                            <th style={{ padding: '5px' }}>Exit</th>
                            <th style={{ padding: '5px', textAlign: 'right' }}>PnL</th>
                            <th style={{ padding: '5px', textAlign: 'right' }}>Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tradeLog.map((row, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #2B2B43' }}>
                                <td style={{ padding: '5px', color: row.type === 'buy' ? '#2196F3' : '#E91E63' }}>
                                    {row.type.toUpperCase()}
                                </td>
                                <td style={{ padding: '5px' }}>
                                    <div>{row.entryPrice.toFixed(5)}</div>
                                    <div style={{ fontSize: '10px', color: '#888' }}>{formatTime(row.entryTime)}</div>
                                </td>
                                <td style={{ padding: '5px' }}>
                                    <div>{row.exitPrice.toFixed(5)}</div>
                                    <div style={{ fontSize: '10px', color: '#888' }}>{formatTime(row.exitTime)}</div>
                                </td>
                                <td style={{
                                    padding: '5px',
                                    textAlign: 'right',
                                    color: row.pnl >= 0 ? '#4CAF50' : '#F44336',
                                    fontWeight: 'bold'
                                }}>
                                    <div>{formatCurrency(row.pnl)}</div>
                                    <div style={{ fontSize: '10px' }}>{row.returnPct.toFixed(2)}%</div>
                                </td>
                                <td style={{ padding: '5px', textAlign: 'right', fontWeight: 'bold', color: '#FFF' }}>
                                    {formatCurrency(row.balance)}
                                </td>
                            </tr>
                        ))}
                        {tradeLog.length === 0 && (
                            <tr>
                                <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                                    No closed trades yet
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer Stats */}
            <div style={{
                padding: '10px',
                borderTop: '1px solid #333',
                background: '#252526',
                display: 'flex',
                justifyContent: 'space-between',
                fontWeight: 'bold',
                fontSize: '14px'
            }}>
                <div>
                    Final Balance:
                    <span style={{ marginLeft: '5px', color: '#FFF' }}>
                        {tradeLog.length > 0 ? formatCurrency(tradeLog[tradeLog.length - 1].balance) : formatCurrency(initialBalance)}
                    </span>
                </div>
                <div>
                    Return:
                    <span style={{
                        marginLeft: '5px',
                        color: (tradeLog.length > 0 && tradeLog[tradeLog.length - 1].balance >= initialBalance) ? '#4CAF50' : '#F44336'
                    }}>
                        {tradeLog.length > 0
                            ? (((tradeLog[tradeLog.length - 1].balance - initialBalance) / initialBalance) * 100).toFixed(2)
                            : '0.00'}%
                    </span>
                </div>
            </div>
        </div>
    );
};

export default TradeHistory;
