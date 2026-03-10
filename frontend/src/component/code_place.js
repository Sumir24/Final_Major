import React, { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";

const CodePlace = ({ onTradesGenerated, onCodeChange, initialCode, apiEndpoint, preCode = '', postCode = '' }) => {
    const defaultCode = `# Write your Python code here
import pandas as pd

# The data is already loaded into 'df'
# df columns: Date, Open, High, Low, Close, Volume

# Example Strategy to generate trades
trades = []

# Ensure Date is string first (remove space if present, though backend does it too)
# Then convert to datetime objects assuming UTC to match the frontend chart
df['Datetime'] = pd.to_datetime(df['Date'].astype(str).str.replace(' ', ''), format='%Y%m%d%H%M%S')

# Simple Moving Average Crossover
df['SMA_20'] = df['Close'].rolling(window=20).mean()
df['SMA_50'] = df['Close'].rolling(window=50).mean()

pk = df['Close']
prev_sma20 = df['SMA_20'].shift(1)
prev_sma50 = df['SMA_50'].shift(1)

for i in range(50, len(df)):
    # Buy Signal (Golden Cross)
    if df['SMA_20'].iloc[i] > df['SMA_50'].iloc[i] and prev_sma20.iloc[i] <= prev_sma50.iloc[i]:
        trades.append({
            'time': int(df['Datetime'].iloc[i].timestamp()), # Unix timestamp (seconds)
            'type': 'buy',
            'price': float(df['Close'].iloc[i])
        })
    
    # Sell Signal (Death Cross)
    elif df['SMA_20'].iloc[i] < df['SMA_50'].iloc[i] and prev_sma20.iloc[i] >= prev_sma50.iloc[i]:
        trades.append({
            'time': int(df['Datetime'].iloc[i].timestamp()),
            'type': 'sell',
            'price': float(df['Close'].iloc[i])
        })

# 'trades' variable will be automatically returned to the frontend
print(f"Generated {len(trades)} trades")
`;
    const [code, setCode] = useState(initialCode || defaultCode);
    const [output, setOutput] = useState("");

    // Notify parent on mount or initialCode change
    useEffect(() => {
        if (onCodeChange) {
            onCodeChange(code);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleCodeChange = (value) => {
        setCode(value);
        if (onCodeChange) {
            onCodeChange(value);
        }
    };
    const [isRunning, setIsRunning] = useState(false);
    const outputRef = useRef(null);

    // Helper to parse date string "YYYYMMDD HHMMSS" to unix timestamp
    const parseCustomDate = (dateStr) => {
        if (typeof dateStr !== 'string') return dateStr;
        // Check for "YYYYMMDD HHMMSS" format
        const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})\s(\d{2})(\d{2})(\d{2})$/);
        if (match) {
            const year = parseInt(match[1]);
            const month = parseInt(match[2]) - 1; // Months are 0-indexed
            const day = parseInt(match[3]);
            const hour = parseInt(match[4]);
            const minute = parseInt(match[5]);
            const second = parseInt(match[6]);
            return new Date(Date.UTC(year, month, day, hour, minute, second)).getTime() / 1000;
        }
        return dateStr;
    };

    // Transform user's trade format to chart format
    const transformTrades = (rawTrades) => {
        if (!Array.isArray(rawTrades)) return [];

        const normalizedTrades = [];

        rawTrades.forEach(trade => {
            // Helper to find value from multiple possible keys
            const getValue = (keys) => {
                for (const key of keys) {
                    if (trade[key] !== undefined) return trade[key];
                }
                return undefined;
            };

            // 1. Try to detect standard single-event format (Time + signal + price)
            // Keys for Time: time, date, datetime, timestamp, "Entry Time" (handled below)
            // Keys for Type: type, signal, side, direction
            // Keys for Price: price, close, "Entry Price"

            const timeVal = getValue(['time', 'date', 'datetime', 'timestamp']);
            const typeVal = getValue(['type', 'signal', 'side', 'direction']);
            const priceVal = getValue(['price', 'close']);

            if (timeVal && typeVal && priceVal) {
                normalizedTrades.push({
                    time: parseCustomDate(timeVal),
                    type: String(typeVal).toLowerCase().includes('buy') ? 'buy' : 'sell',
                    price: parseFloat(priceVal),
                    color: trade.color,
                    name: trade.name
                });
                return;
            }

            // 2. User's specific "Entry/Exit" Strategy Format
            if (trade["Entry Time"] && trade["Entry Price"]) {
                // Entry Marker
                normalizedTrades.push({
                    time: parseCustomDate(trade["Entry Time"]),
                    type: 'buy', // Entry is usually a buy in this context
                    price: parseFloat(trade["Entry Price"])
                });

                // Exit Marker (if exists)
                if (trade["Exit Time"] && trade["Exit Price"]) {
                    normalizedTrades.push({
                        time: parseCustomDate(trade["Exit Time"]),
                        type: 'sell',
                        price: parseFloat(trade["Exit Price"])
                    });
                }
            }
        });
        return normalizedTrades;
    };

    const runOnBackend = async () => {
        setIsRunning(true);
        setOutput("Running on backend...");

        const endpoint = apiEndpoint || 'http://localhost:5000/api/signals/create-signal';

        try {
            const finalCodeString = `${preCode}\n${code}\n${postCode}`;
            console.log("=== SENDING TO BACKEND ===");
            console.log(finalCodeString);

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ code: finalCodeString }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            let normalizedTrades = [];
            if (data.trades) {
                setOutput((prev) => prev + `\nSuccess! Generated ${data.trades.length} trades.\n`);
                normalizedTrades = transformTrades(data.trades);
            } else {
                setOutput((prev) => prev + `\nWarning: No 'trades' found in output.\n`);
            }

            let extractedIndicators = [];
            if (data.indicators && Array.isArray(data.indicators)) {
                extractedIndicators = data.indicators;
                setOutput((prev) => prev + `Extracted ${extractedIndicators.length} indicators for visualization.\n`);
            }

            if (onTradesGenerated) {
                onTradesGenerated({ trades: normalizedTrades, indicators: extractedIndicators });
            }

        } catch (error) {
            setOutput((prev) => prev + `\nError running on backend:\n${error.message}`);
        } finally {
            setIsRunning(false);
        }
    };

    const saveIndicator = async () => {
        const fileName = window.prompt('Enter a name for the CSV file (e.g., my_indicator):');
        if (!fileName) {
            return; // Cancel the save if no name is provided
        }

        setIsRunning(true);
        setOutput(`Saving indicator to ${fileName}.csv...`);

        try {
            const response = await fetch('http://localhost:5000/api/indicators/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: fileName,
                    code: `${preCode}\n${code}\n${postCode}`
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            if (data.status === "success" && data.new_columns) {
                let msg = "";
                if (data.new_columns.length > 0) {
                    msg = `\nSuccess! Saved new columns to global dataset:\n- ${data.new_columns.join('\n- ')}\n`;
                } else {
                    msg = `\nSuccess! Calculated columns.\n`;
                }

                if (data.csv_saved) {
                    msg += `\n💾 Data successfully exported to '${data.file_name}'.`;
                } else {
                    msg += `\n⚠️ Note: Could not save physical CSV, check backend logs. Data is saved in memory.`;
                }

                msg += `\n\nYou can now use these in the Terminal!`;
                setOutput(msg);
            } else {
                setOutput(`\nSuccess! Indicator data saved.`);
            }

        } catch (error) {
            setOutput(`\nError saving indicator:\n${error.message}`);
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "20px", gap: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0px" }}>
                <h2 style={{ fontSize: "16px", margin: 0, color: "#8b9bb4" }}>Python Script Algorithm</h2>
                <div style={{ display: "flex", gap: "10px" }}>
                    {apiEndpoint === "http://localhost:5000/api/indicators/preview" && (
                        <button
                            onClick={saveIndicator}
                            disabled={isRunning}
                            style={{
                                padding: "6px 14px",
                                fontSize: "13px",
                                backgroundColor: isRunning ? "transparent" : "rgba(76, 175, 80, 0.1)",
                                color: isRunning ? "#ccc" : "#4CAF50",
                                border: "1px solid " + (isRunning ? "#555" : "rgba(76, 175, 80, 0.3)"),
                                borderRadius: "4px",
                                cursor: isRunning ? "not-allowed" : "pointer",
                                transition: "all 0.2s"
                            }}
                        >
                            {isRunning ? "Running..." : "Save Indicator"}
                        </button>
                    )}
                    <button
                        onClick={runOnBackend}
                        disabled={isRunning}
                        style={{
                            padding: "6px 14px",
                            fontSize: "13px",
                            backgroundColor: isRunning ? "transparent" : "rgba(33, 150, 243, 0.1)",
                            color: isRunning ? "#ccc" : "#2196F3",
                            border: "1px solid " + (isRunning ? "#555" : "rgba(33, 150, 243, 0.3)"),
                            borderRadius: "4px",
                            cursor: isRunning ? "not-allowed" : "pointer",
                            transition: "all 0.2s"
                        }}
                    >
                        {isRunning ? "Running..." : "Run Algorithm"}
                    </button>
                </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px", flex: 1, minHeight: 0 }}>
                {/* Editor Container */}
                <div style={{ flex: 2, display: "flex", flexDirection: "column", border: "1px solid #2A2E39", borderRadius: "8px", overflow: "hidden" }}>
                    <Editor
                        height="100%"
                        defaultLanguage="python"
                        theme="vs-dark"
                        value={code}
                        onChange={handleCodeChange}
                        options={{
                            minimap: { enabled: false },
                            fontSize: 14,
                            scrollBeyondLastLine: false,
                            wordWrap: "on"
                        }}
                    />
                </div>

                {/* Output Container */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", border: "1px solid #2A2E39", borderRadius: "8px", backgroundColor: "#1e1e1e", color: "#d4d4d4", overflow: "hidden" }}>
                    <div style={{ padding: "8px 12px", borderBottom: "1px solid #2A2E39", backgroundColor: "rgba(20, 24, 34, 0.5)", fontSize: "12px", color: "#8b9bb4", fontWeight: "600", textTransform: "uppercase", letterSpacing: "1px" }}>
                        Console Output
                    </div>
                    <pre ref={outputRef} style={{ padding: "12px", margin: 0, overflow: "auto", flex: 1, fontFamily: "Consolas, 'Courier New', monospace", fontSize: "13px" }}>
                        {output || "No output yet."}
                    </pre>
                </div>
            </div >
        </div >
    );
};

export default CodePlace;
