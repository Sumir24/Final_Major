import React, { useState, useEffect } from 'react';
import Chart from '../component/chart';
import CodePlace from '../component/code_place';
import IndicatorShow from '../component/indicator_show';
import { Link } from 'react-router-dom';

const IndicatorBuilder = () => {
    const [trades, setTrades] = useState([]);
    const [indicators, setIndicators] = useState([]);
    const [csvData, setCsvData] = useState(null);
    const [currentCode, setCurrentCode] = useState('');

    const [visConfigs, setVisConfigs] = useState([
        { name: "SMA", type: "line", color: "#2962FF", overlay: true },
        { name: "Upper", type: "line", color: "#00E676", overlay: true },
        { name: "Lower", type: "line", color: "#FF5252", overlay: true }
    ]);

    // NEW: State for configuring trade signal markers
    const [markerConfigs, setMarkerConfigs] = useState([
        { name: "Bullish_Reversal", type: "buy", color: "#00E676" },
        { name: "Bearish_Reversal", type: "sell", color: "#FF5252" }
    ]);

    const initialCode = `# =========================================
# INDICATOR LOGIC BUILDER
# =========================================
# Welcome! Write your Python (Pandas) logic below.
# 
# 1. THE DATA (df):
#    A dataframe named 'df' is automatically loaded with Date, Open, High, Low, Close, Volume.
#    A 'Datetime' column is also pre-calculated for you.
# 
# 2. DO YOUR MATH:
#    Create your new indicator columns based on the 'df' dataframe.
#    Example: 
#    df['SMA'] = df['Close'].rolling(window=20).mean()
# 
# 3. TRADE SIGNALS (MARKERS):
#    To generate Buy/Sell arrows on the chart, create a column that equals True (or 1).
#    Example:
#    df['Bullish_Cross'] = df['SMA_Fast'] > df['SMA_Slow']
#    Then, map 'Bullish_Cross' to a 'Buy' marker in the Signal Markers panel below!

# Example: Bollinger Bands
window = 20
std_dev = 2.0

df['SMA'] = df['Close'].rolling(window=window).mean()
df['STD'] = df['Close'].rolling(window=window).std()
df['Upper'] = df['SMA'] + (df['STD'] * std_dev)
df['Lower'] = df['SMA'] - (df['STD'] * std_dev)
`;

    const preCode = `
import pandas as pd

# The backend already removes the space from '20250101 170000' -> '20250101170000'
if 'Datetime' not in df.columns:
    df['Datetime'] = pd.to_datetime(df['Date'].astype(str), format='%Y%m%d%H%M%S')
`;

    const generatePostCode = () => {
        let code = `\n# --- AUTO-GENERATED VISUALIZATION EXPORTS ---\n`;
        code += `indicators = []\n`;

        visConfigs.forEach(config => {
            if (config.name.trim() !== '') {
                code += `
if '${config.name}' in df.columns:
    indicators.append({
        "name": "${config.name}",
        "type": "${config.type}",
        "color": "${config.color}",
        "overlay": ${config.overlay ? 'True' : 'False'},
        "data": [
            {
                "time": int(float(df['Datetime'].iloc[i].timestamp())), 
                "value": float(df['${config.name}'].iloc[i])
            }
            for i in range(len(df))
            if not pd.isna(df['${config.name}'].iloc[i])
        ]
    })
`;
            }
        });

        // NEW: Auto-generate marker logic based on markerConfigs
        if (markerConfigs.some(c => c.name.trim() !== '')) {
            code += `\n# --- AUTO-GENERATED MARKER EXPORTS ---\n`;
            code += `if 'trades' not in locals():\n    trades = []\n`;

            markerConfigs.forEach(config => {
                if (config.name.trim() !== '') {
                    code += `
if '${config.name}' in df.columns:
    for i in range(len(df)):
        val = df['${config.name}'].iloc[i]
        # Only trigger if the signal is 'True' or a positive number (like 1)
        if pd.notna(val) and (val == True or (isinstance(val, (int, float)) and val > 0)):
            trades.append({
                'time': int(float(df['Datetime'].iloc[i].timestamp())),
                'type': '${config.type}',
                'color': '${config.color}',
                'name': '${config.name}',
                'price': float(df['Close'].iloc[i])
            })
`;
                }
            });
        }

        return code;
    };

    const postCode = generatePostCode();

    // Handler for simulation results
    const handleSimulationResults = (result) => {
        if (result && typeof result === 'object') {
            // Explicitly set/clear trades and indicators to prevent stale visual artifacts
            setTrades(result.trades || []);
            setIndicators(result.indicators || []);
        }
    };

    const handleSaveSetup = async (name) => {
        try {
            const fullCode = `${preCode}\n${currentCode}\n${postCode}`;
            const response = await fetch('http://localhost:5000/api/indicator-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: name,
                    code: fullCode
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            alert('Indicator setup saved successfully!');
        } catch (error) {
            console.error("Error saving indicator setup:", error);
            alert('Failed to save indicator setup: ' + error.message);
        }
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await fetch('/data.csv');
                if (!response.ok) throw new Error("Failed to fetch data");
                const text = await response.text();
                setCsvData(text);
            } catch (err) {
                console.error("Error loading data:", err);
            }
        };
        fetchData();
        setCurrentCode(initialCode);
    }, []);

    const addVisConfig = () => {
        setVisConfigs([...visConfigs, { name: "", type: "line", color: "#ffffff", overlay: true }]);
    };

    const updateVisConfig = (index, field, value) => {
        const newConfigs = [...visConfigs];
        newConfigs[index][field] = value;
        setVisConfigs(newConfigs);
    };

    const removeVisConfig = (index) => {
        const newConfigs = visConfigs.filter((_, i) => i !== index);
        setVisConfigs(newConfigs);
    };

    // NEW: Handlers for Marker Configs
    const addMarkerConfig = () => {
        setMarkerConfigs([...markerConfigs, { name: "", type: "buy", color: "#00E676" }]);
    };

    const updateMarkerConfig = (index, field, value) => {
        const newConfigs = [...markerConfigs];
        newConfigs[index][field] = value;
        setMarkerConfigs(newConfigs);
    };

    const removeMarkerConfig = (index) => {
        const newConfigs = markerConfigs.filter((_, i) => i !== index);
        setMarkerConfigs(newConfigs);
    };

    return (
        <div className="indicator-builder">
            <style>{`
                .indicator-builder {
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                height: 100vh;
                background-color: #0b0e14;
                color: #d1d4dc;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                }

                /* Scrollbar */
                ::-webkit-scrollbar {
                    width: 6px;
                height: 6px;
                }
                ::-webkit-scrollbar-track {
                    background: transparent;
                }
                ::-webkit-scrollbar-thumb {
                    background: #2A2E39;
                border-radius: 4px;
                }
                ::-webkit-scrollbar-thumb:hover {
                    background: #363C4E;
                }

                /* Header */
                .ib-header {
                    display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 14px 24px;
                background: #131722;
                border-bottom: 1px solid #2A2E39;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                z-index: 10;
                }
                .ib-title {
                    font-size: 18px;
                font-weight: 700;
                color: #fff;
                display: flex;
                align-items: center;
                gap: 12px;
                margin: 0;
                }
                .ib-title-dot {
                    width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #2962FF;
                box-shadow: 0 0 12px rgba(41, 98, 255, 0.8);
                }
                .ib-btn-outline {
                    padding: 8px 16px;
                background: transparent;
                color: #8b9bb4;
                font-size: 13px;
                font-weight: 600;
                text-decoration: none;
                border: 1px solid #363C4E;
                border-radius: 6px;
                transition: all 0.2s;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                }
                .ib-btn-outline:hover {
                    background: #2A2E39;
                color: #fff;
                border-color: #434651;
                }

                /* Layout Workspace */
                .ib-workspace {
                    display: flex;
                flex: 1;
                padding: 16px;
                gap: 16px;
                overflow: hidden;
                background: radial-gradient(circle at 50% 0%, #171b26 0%, #0b0e14 100%);
                }

                .ib-panel-col {
                    display: flex;
                flex-direction: column;
                flex: 1;
                gap: 16px;
                min-width: 0;
                }

                .ib-card {
                    background: rgba(30, 34, 45, 0.6);
                backdrop-filter: blur(16px);
                border: 1px solid #2A2E39;
                border-radius: 12px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                box-shadow: 0 8px 24px rgba(0,0,0,0.15);
                }

                .ib-card-header {
                    padding: 12px 20px;
                background: rgba(20, 24, 34, 0.4);
                border-bottom: 1px solid #2A2E39;
                font-size: 14px;
                font-weight: 600;
                color: #e0e0e0;
                display: flex;
                justify-content: space-between;
                align-items: center;
                }

                .ib-card-body {
                    flex: 1;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                position: relative;
                }

                /* Buttons */
                .ib-btn-primary {
                    padding: 6px 14px;
                background: #2962FF;
                color: white;
                font-size: 12px;
                font-weight: 600;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.2s;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                }
                .ib-btn-primary:hover {
                    background: #1e53e5;
                box-shadow: 0 4px 12px rgba(41, 98, 255, 0.3);
                }

                .ib-btn-danger {
                    padding: 8px 12px;
                background: rgba(255, 82, 82, 0.1);
                color: #FF5252;
                border: 1px solid rgba(255, 82, 82, 0.2);
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.2s;
                font-size: 13px;
                font-weight: 500;
                }
                .ib-btn-danger:hover {
                    background: rgba(255, 82, 82, 0.2);
                border-color: rgba(255, 82, 82, 0.4);
                }

                /* Settings Config Row */
                .ib-config-list {
                    padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 12px;
                }
                .ib-config-row {
                    display: grid;
                grid-template-columns: 2fr 2fr 2fr 1fr auto;
                gap: 12px;
                align-items: flex-end;
                background: rgba(20, 24, 34, 0.5);
                padding: 16px;
                border-radius: 8px;
                border: 1px solid rgba(42, 46, 57, 0.6);
                transition: all 0.2s;
                }

                .ib-config-row-compact {
                    grid-template-columns: 2fr 2fr 1fr auto !important;
                }

                .ib-config-row:hover {
                    border-color: #363C4E;
                background: rgba(20, 24, 34, 0.8);
                }

                .ib-input-group {
                    display: flex;
                flex-direction: column;
                gap: 6px;
                }
                .ib-label {
                    font-size: 11px;
                color: #8b9bb4;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                font-weight: 600;
                }
                .ib-input, .ib-select {
                    width: 100%;
                padding: 8px 12px;
                border-radius: 6px;
                border: 1px solid #363C4E;
                background: #131722;
                color: #D1D4DC;
                font-size: 13px;
                transition: all 0.2s;
                box-sizing: border-box;
                height: 36px;
                }
                .ib-input:focus, .ib-select:focus {
                    outline: none;
                border-color: #2962FF;
                background: #171b26;
                }
                .ib-color-picker {
                    height: 36px;
                width: 100%;
                padding: 2px;
                background: #131722;
                border: 1px solid #363C4E;
                border-radius: 6px;
                cursor: pointer;
                box-sizing: border-box;
                }

                .ib-empty-state {
                    color: #8b9bb4;
                font-size: 13px;
                text-align: center;
                padding: 30px;
                background: rgba(20, 24, 34, 0.3);
                border: 1px dashed #363C4E;
                border-radius: 8px;
                }

                .ib-hint {
                    margin: 0 20px 20px;
                padding: 12px 16px;
                background: rgba(41, 98, 255, 0.1);
                border-left: 3px solid #2962FF;
                border-radius: 0 6px 6px 0;
                color: #8b9bb4;
                font-size: 12px;
                display: flex;
                align-items: center;
                gap: 10px;
                }
            `}</style>

            {/* Header */}
            <header className="ib-header">
                <h1 className="ib-title">
                    <span className="ib-title-dot"></span>
                    Indicator Lab
                </h1>
                <Link to="/" className="ib-btn-outline">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                    Back to Terminal
                </Link>
            </header>

            {/* Main Workspace Workspace */}
            <main className="ib-workspace">

                {/* Left Column: Code & Settings */}
                <div className="ib-panel-col" style={{ flex: '2' }}>

                    {/* Code Editor Card */}
                    <div className="ib-card" style={{ flex: 4 }}>
                        <div className="ib-card-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2962FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                                Algorithm Strategy
                            </div>
                        </div>
                        <div className="ib-card-body" style={{ padding: 0 }}>
                            <CodePlace
                                onTradesGenerated={handleSimulationResults}
                                onCodeChange={setCurrentCode}
                                initialCode={initialCode}
                                apiEndpoint="http://localhost:5000/api/indicators/preview"
                                preCode={preCode}
                                postCode={postCode}
                            />
                        </div>
                    </div>

                    {/* Vis Settings Card */}
                    <div className="ib-card" style={{ flex: 1.5, minHeight: '200px' }}>
                        <div className="ib-card-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00E676" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>
                                Visualization Outputs
                            </div>
                            <button onClick={addVisConfig} className="ib-btn-primary">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                Add Series
                            </button>
                        </div>
                        <div className="ib-card-body">
                            <div className="ib-config-list">
                                {visConfigs.length === 0 ? (
                                    <div className="ib-empty-state">
                                        No visualization columns configured. Click "Add Series" to start plotting.
                                    </div>
                                ) : (
                                    visConfigs.map((config, i) => (
                                        <div key={i} className="ib-config-row">
                                            <div className="ib-input-group">
                                                <label className="ib-label">Data Column</label>
                                                <input
                                                    type="text"
                                                    value={config.name}
                                                    onChange={(e) => updateVisConfig(i, 'name', e.target.value)}
                                                    placeholder="e.g. SMA"
                                                    className="ib-input"
                                                />
                                            </div>

                                            <div className="ib-input-group">
                                                <label className="ib-label">Plot Type</label>
                                                <select
                                                    value={config.type}
                                                    onChange={(e) => updateVisConfig(i, 'type', e.target.value)}
                                                    className="ib-select"
                                                >
                                                    <option value="line">Line</option>
                                                    <option value="histogram">Histogram</option>
                                                </select>
                                            </div>

                                            <div className="ib-input-group">
                                                <label className="ib-label">Position</label>
                                                <select
                                                    value={config.overlay ? 'true' : 'false'}
                                                    onChange={(e) => updateVisConfig(i, 'overlay', e.target.value === 'true')}
                                                    className="ib-select"
                                                >
                                                    <option value="true">Overlay</option>
                                                    <option value="false">Separate</option>
                                                </select>
                                            </div>

                                            <div className="ib-input-group">
                                                <label className="ib-label">Color</label>
                                                <input
                                                    type="color"
                                                    value={config.color}
                                                    onChange={(e) => updateVisConfig(i, 'color', e.target.value)}
                                                    className="ib-color-picker"
                                                />
                                            </div>

                                            <div>
                                                <button onClick={() => removeVisConfig(i)} className="ib-btn-danger" title="Remove Series">
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div className="ib-hint">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                <span>The Data Column name must exactly match a column you compute in your Python algorithm.</span>
                            </div>
                        </div>
                    </div>

                    {/* NEW: Trade Signals / Markers Card */}
                    <div className="ib-card" style={{ flex: 1.5, minHeight: '200px' }}>
                        <div className="ib-card-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF5252" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                                Trade Signals (Markers)
                            </div>
                            <button onClick={addMarkerConfig} className="ib-btn-primary">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                Add Signal
                            </button>
                        </div>
                        <div className="ib-card-body">
                            <div className="ib-config-list">
                                {markerConfigs.length === 0 ? (
                                    <div className="ib-empty-state">
                                        No signal markers configured. Click "Add Signal" to map a column to buy/sell arrows.
                                    </div>
                                ) : (
                                    markerConfigs.map((config, i) => (
                                        <div key={i} className="ib-config-row ib-config-row-compact">
                                            <div className="ib-input-group">
                                                <label className="ib-label">Logic Column</label>
                                                <input
                                                    type="text"
                                                    value={config.name}
                                                    onChange={(e) => updateMarkerConfig(i, 'name', e.target.value)}
                                                    placeholder="e.g. Bullish_Reversal"
                                                    className="ib-input"
                                                />
                                            </div>

                                            <div className="ib-input-group">
                                                <label className="ib-label">Marker Direction</label>
                                                <select
                                                    value={config.type}
                                                    onChange={(e) => updateMarkerConfig(i, 'type', e.target.value)}
                                                    className="ib-select"
                                                >
                                                    <option value="buy">Buy (Up Arrow)</option>
                                                    <option value="sell">Sell (Down Arrow)</option>
                                                </select>
                                            </div>

                                            <div className="ib-input-group">
                                                <label className="ib-label">Color</label>
                                                <input
                                                    type="color"
                                                    value={config.color}
                                                    onChange={(e) => updateMarkerConfig(i, 'color', e.target.value)}
                                                    className="ib-color-picker"
                                                />
                                            </div>

                                            <div>
                                                <button onClick={() => removeMarkerConfig(i)} className="ib-btn-danger" title="Remove Signal">
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div className="ib-hint">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                <span>Puts a marker on the chart whenever the specified Logic Column evaluates to True (or &gt; 0).</span>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Right Column: Chart & Results */}
                <div className="ib-panel-col" style={{ flex: '1.5' }}>

                    {/* Chart Card */}
                    <div className="ib-card" style={{ flex: 3 }}>
                        <div className="ib-card-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF5252" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"></path><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"></path></svg>
                                Preview Chart
                            </div>
                        </div>
                        <div className="ib-card-body" style={{ padding: '8px' }}>
                            <div style={{ flex: 1, width: '100%', position: 'relative' }}>
                                <Chart trades={trades} indicators={indicators} data={csvData} />
                            </div>
                        </div>
                    </div>

                    {/* Indicator Explorer / Results Card */}
                    <div className="ib-card" style={{ flex: 1.5 }}>
                        <div className="ib-card-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFD600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                                Compiled Outputs
                            </div>
                        </div>
                        <div className="ib-card-body" style={{ padding: 0 }}>
                            <IndicatorShow indicators={indicators} onSaveSetup={handleSaveSetup} />
                        </div>
                    </div>

                </div>

            </main>
        </div>
    );
};

export default IndicatorBuilder;
