import React, { useState, useEffect } from 'react';
import Chart from '../component/chart';
import CodePlace from '../component/code_place';
import Navbar from '../component/Navbar';
import ChatWithAI from '../component/ChatWithAI';
import './IndicatorBuilder.css';

const IndicatorBuilder = () => {
    const [trades, setTrades] = useState([]);
    const [indicators, setIndicators] = useState([]);
    const [csvData, setCsvData] = useState(null);
    const [currentCode, setCurrentCode] = useState('');
    const [isChatOpen, setIsChatOpen] = useState(true);
    const [aiTrigger, setAiTrigger] = useState(null);

    const [visConfigs, setVisConfigs] = useState([
        { name: "MA_25", type: "line", color: "#2962FF", overlay: true },
        { name: "RSI", type: "line", color: "#6200EA", overlay: false },
        { name: "Upper", type: "line", color: "#00E676", overlay: true },
        { name: "Lower", type: "line", color: "#FF5252", overlay: true }
    ]);

    // NEW: State for configuring trade signal markers
    const [markerConfigs, setMarkerConfigs] = useState([
        { name: "Buy_Signal", type: "buy", color: "#00E676" },
        { name: "Sell_Signal", type: "sell", color: "#FF1744" }
    ]);

    const initialCode = `# =========================================
# INDICATOR LOGIC BUILDER
# =========================================
# Welcome! Write your Python (Pandas) logic below.
# 
# 1. THE DATA (df):
#    A dataframe named 'df' is automatically loaded with Open, High, Low, Close.
# 
# 2. DO YOUR MATH:
#    df['SMA'] = df['Close'].rolling(window=20).mean()
# 
# 3. SYNC WITH UI (NEW!):
#    Use these tags to auto-configure the chart panels below:
#    # @vis { name: "SMA", type: "line", color: "#2962FF", overlay: true }
#    # @signal { name: "Cross", type: "buy", color: "#00E676" }

# Example: Bollinger Bands
window = 20
std_dev = 2.0

df['SMA'] = df['Close'].rolling(window=window).mean()
df['STD'] = df['Close'].rolling(window=window).std()
df['Upper'] = df['SMA'] + (df['STD'] * std_dev)
df['Lower'] = df['SMA'] - (df['STD'] * std_dev)

# @vis { name: "Upper", type: "line", color: "#00E676", overlay: true }
# @vis { name: "Lower", type: "line", color: "#FF5252", overlay: true }
`;

    const preCode = `
import pandas as pd
import numpy as np

# The backend already removes the space from '20250101 170000' -> '20250101170000'
if 'Datetime' not in df.columns:
    # CRITICAL: Force UTC so .timestamp() matches frontend chart
    df['Datetime'] = pd.to_datetime(df['Date'].astype(str), format='%Y%m%d%H%M%S', utc=True)

# --- UNIVERSAL SCALING ENVIRONMENT ---
# Pre-calculating ATR and TR so they are available globally for oscillators
_hl = (df['High'] - df['Low'])
_hc = (df['High'] - df['Close'].shift()).abs()
_lc = (df['Low'] - df['Close'].shift()).abs()
_tr = pd.concat([_hl, _hc, _lc], axis=1).max(axis=1)
df['ATR'] = _tr.rolling(14).mean()
df['TR']  = _tr
`;

    const generatePostCode = () => {
        let code = `\n# --- SMART VISUALIZATION EXPORTS ---\n`;
        code += `if 'indicators' not in locals(): indicators = []\n`;

        visConfigs.forEach(config => {
            if (config.name.trim() !== '') {
                code += `
if '${config.name}' in df.columns:
    # Optimized Vectorized Extraction
    _valid = df[df['${config.name}'].notna()]
    indicators.append({
        "name": "${config.name}",
        "type": "${config.type}",
        "color": "${config.color}",
        "overlay": ${config.overlay ? 'True' : 'False'},
        "data": [
            {"time": int(t.timestamp()), "value": float(v)}
            for t, v in zip(_valid['Datetime'], _valid['${config.name}'])
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
    # Optimized Vectorized Marker Extraction
    # Matches: True/1 or any price value (float/int > 0)
    _t_valid = df[df['${config.name}'].notna() & ((df['${config.name}'] == True) | (df['${config.name}'] > 0))]
    for t, p, v in zip(_t_valid['Datetime'], _t_valid['Close'], _t_valid['${config.name}']):
        trades.append({
            'time': int(t.timestamp()),
            'type': '${config.type}',
            'color': '${config.color}',
            'name': '${config.name}',
            'price': float(p)
        })
`;
                }
            });
        }

        // NEW: SMART AUTO-POPULATOR (Zero-Config)
        // This handles indicators and trades that WERE REGISTERED IN THE CODE, not the UI
        code += `\n# --- SMART DATA POPULATOR (Zero-Config) ---\n`;
        code += `
# Populate data for indicators registered in the code
for ind in indicators:
    if "data" not in ind and ind["name"] in df.columns:
        _v_mapped = df[df[ind["name"]].notna()]
        ind["data"] = [
            {"time": int(t.timestamp()), "value": float(v)}
            for t, v in zip(_v_mapped['Datetime'], _v_mapped[ind["name"]])
        ]

# Populate data for trades registered in the code
for trd in trades:
    if "time" not in trd and "name" in trd and trd["name"] in df.columns:
        _t_mapped = df[df[trd["name"]].notna() & ((df[trd["name"]] == True) | (df[trd["name"]] > 0))]
        # Since we found the indices where the signal triggered, we need to create the actual trade objects
        # We replace the original placeholder entry in the list
        code_trades = [
            {
                'time': int(t.timestamp()),
                'type': trd.get('type', 'buy'),
                'color': trd.get('color', '#00E676'),
                'name': trd['name'],
                'price': float(p)
            }
            for t, p in zip(_t_mapped['Datetime'], _t_mapped['Close'])
        ]
        # Remove the placeholder and add the real ones
        trades.remove(trd)
        trades.extend(code_trades)
        break # Only handle one signal name at a time to prevent list modification issues in loop
`;

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


    const syncConfigsFromCode = (code) => {
        const visConfigsFound = [];
        const markerConfigsFound = [];
        
        const lines = code.split('\n');
        lines.forEach(line => {
            // 1. Support @vis tag: # @vis { name: "...", type: "...", color: "...", overlay: ... }
            const visMatch = line.match(/#\s*@vis\s*({.*})/i);
            if (visMatch) {
                try {
                    const content = visMatch[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"');
                    const parsed = JSON.parse(content);
                    visConfigsFound.push({
                        name: parsed.name || "Indicator",
                        type: parsed.type || "line",
                        color: parsed.color || "#2962FF",
                        overlay: parsed.overlay !== undefined ? parsed.overlay : true
                    });
                } catch (e) {}
            }
            
            // 2. Support @signal tag: # @signal { name: "...", type: "...", color: "..." }
            const signalMatch = line.match(/#\s*@signal\s*({.*})/i);
            if (signalMatch) {
                try {
                    const content = signalMatch[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"');
                    const parsed = JSON.parse(content);
                    markerConfigsFound.push({
                        name: parsed.name || "Signal",
                        type: parsed.type || "buy",
                        color: parsed.color || "#00E676"
                    });
                } catch (e) {}
            }

            // 3. Fallback: Support indicators.append logic
            const appendMatch = line.match(/indicators\.append\(\{\s*"name":\s*"([^"]+)",\s*"type":\s*"([^"]+)",\s*"color":\s*"([^"]+)",\s*"overlay":\s*(True|False)/i);
            if (appendMatch) {
                visConfigsFound.push({
                    name: appendMatch[1],
                    type: appendMatch[2],
                    color: appendMatch[3],
                    overlay: appendMatch[4] === 'True'
                });
            }
        });
        
        if (visConfigsFound.length > 0) setVisConfigs(visConfigsFound);
        if (markerConfigsFound.length > 0) setMarkerConfigs(markerConfigsFound);
    };

    const handleApplyCode = (code) => {
        setCurrentCode(code);
        syncConfigsFromCode(code);
    };

    const handleAIAction = (actionType) => {
        setIsChatOpen(true);
        const prompt = actionType === 'explain'
            ? `Explain the following python trading logic:\n\n\`\`\`python\n${currentCode}\n\`\`\``
            : `Refine and optimize this python trading logic, ensuring it uses pandas best practices. 
               Also, please include visualization metadata as comments at the bottom of the code using this format:
               # @vis { name: "ColumnName", type: "line|histogram", color: "#HEX", overlay: true|false }
               # @signal { name: "SignalColumn", type: "buy|sell", color: "#HEX" }
               
               Current Code:
               \`\`\`python\n${currentCode}\n\`\`\``;

        setAiTrigger({ id: Date.now(), text: prompt });
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
    }, [initialCode]);

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
        <div className="ib-container">
            <Navbar />

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowX: 'auto', overflowY: 'hidden' }}>
                {/* Header Toolbar */}
                <div style={{
                    height: '48px',
                    background: '#161b22',
                    borderBottom: '1px solid #283039',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 20px',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className="material-symbols-outlined" style={{ color: '#00E676', fontSize: '20px' }}>query_stats</span>
                        <span style={{ fontWeight: 600, fontSize: '13px', letterSpacing: '1px', textTransform: 'uppercase' }}>Strategy Logic Builder</span>
                    </div>
                </div>

                {/* Main Workspace Layout */}
                <main className="ib-main-layout" style={{ flex: 1 }}>
                    {/* Left Sidebar: Properties / Configs */}
                    <div className="ib-sidebar-left">
                        {/* Header Replacements moved here */}
                        <div className="ib-sidebar-controls" style={{ padding: '16px 16px 0 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <button
                                className={`btn-premium btn-ai-toggle ${isChatOpen ? 'active-glow' : ''}`}
                                onClick={() => setIsChatOpen(!isChatOpen)}
                                style={{ width: '100%', justifyContent: 'center' }}
                            >
                                <span className="material-symbols-outlined">smart_toy</span>
                                {isChatOpen ? 'Hide AI Assist' : 'AI Assistant'}
                            </button>
                        </div>

                        {/* Visualization Outputs Section */}
                        <div className="ib-panel-group">
                            <div className="ib-panel-header">
                                <h4>
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#00E676' }}>stacked_line_chart</span>
                                    Visualizations
                                </h4>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => syncConfigsFromCode(currentCode)} className="ib-btn-mini-add" title="Sync from Code">
                                        <span className="material-symbols-outlined">sync</span>
                                    </button>
                                    <button onClick={addVisConfig} className="ib-btn-mini-add" title="Add Visualization">
                                        <span className="material-symbols-outlined">add</span>
                                    </button>
                                </div>
                            </div>
                            <div className="ib-panel-content" style={{ padding: '16px' }}>
                                {visConfigs.length === 0 ? (
                                    <div className="ib-empty-state">No visualizations configured.</div>
                                ) : (
                                    visConfigs.map((config, i) => (
                                        <div key={i} className="ib-config-card animate-fade">
                                            <div className="ib-form-control">
                                                <label className="ib-label">Column Name</label>
                                                <input
                                                    type="text"
                                                    value={config.name}
                                                    onChange={(e) => updateVisConfig(i, 'name', e.target.value)}
                                                    placeholder="e.g. SMA_20"
                                                    className="ib-input-dark"
                                                />
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                                <div className="ib-form-control">
                                                    <label className="ib-label">Type</label>
                                                    <select
                                                        value={config.type}
                                                        onChange={(e) => updateVisConfig(i, 'type', e.target.value)}
                                                        className="ib-input-dark"
                                                    >
                                                        <option value="line">Line</option>
                                                        <option value="histogram">Histogram</option>
                                                    </select>
                                                </div>
                                                <div className="ib-form-control">
                                                    <label className="ib-label">Position</label>
                                                    <select
                                                        value={config.overlay ? 'true' : 'false'}
                                                        onChange={(e) => updateVisConfig(i, 'overlay', e.target.value === 'true')}
                                                        className="ib-input-dark"
                                                    >
                                                        <option value="true">Overlay</option>
                                                        <option value="false">Separate</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '8px' }}>
                                                <input
                                                    type="color"
                                                    value={config.color}
                                                    onChange={(e) => updateVisConfig(i, 'color', e.target.value)}
                                                    style={{ width: '32px', height: '32px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                                                />
                                                <button onClick={() => removeVisConfig(i)} className="ib-btn-icon-danger" title="Remove">
                                                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Trade Signals Section */}
                        <div className="ib-panel-group">
                            <div className="ib-panel-header">
                                <h4>
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#FF5252' }}>ads_click</span>
                                    Trade Signals
                                </h4>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => syncConfigsFromCode(currentCode)} className="ib-btn-mini-add" title="Sync from Code">
                                        <span className="material-symbols-outlined">sync</span>
                                    </button>
                                    <button onClick={addMarkerConfig} className="ib-btn-mini-add">
                                        <span className="material-symbols-outlined">add</span>
                                    </button>
                                </div>
                            </div>
                            <div className="ib-panel-content" style={{ padding: '16px' }}>
                                {markerConfigs.map((config, i) => (
                                    <div key={i} className="ib-config-card animate-fade">
                                        <div className="ib-form-control">
                                            <label className="ib-label">Signal Column</label>
                                            <input
                                                type="text"
                                                value={config.name}
                                                onChange={(e) => updateMarkerConfig(i, 'name', e.target.value)}
                                                className="ib-input-dark"
                                            />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                            <select
                                                value={config.type}
                                                onChange={(e) => updateMarkerConfig(i, 'type', e.target.value)}
                                                className="ib-input-dark"
                                            >
                                                <option value="buy">Buy</option>
                                                <option value="sell">Sell</option>
                                            </select>
                                            <input
                                                type="color"
                                                value={config.color}
                                                onChange={(e) => updateMarkerConfig(i, 'color', e.target.value)}
                                                className="ib-input-dark"
                                                style={{ height: '34px', padding: '2px' }}
                                            />
                                        </div>
                                        <button onClick={() => removeMarkerConfig(i)} className="btn-save" style={{ width: '100%', marginTop: '12px', fontSize: '11px', padding: '4px' }}>
                                            Remove Signal
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>

                    {/* Center Workspace: Editor (Top) & Preview (Bottom) */}
                    <div className="ib-workspace-center">
                        <section className="ib-editor-section">
                            <CodePlace
                                onTradesGenerated={handleSimulationResults}
                                onCodeChange={setCurrentCode}
                                codeProp={currentCode}
                                onAIAction={handleAIAction}
                                initialCode={initialCode}
                                apiEndpoint="http://localhost:5000/api/indicators/preview"
                                preCode={preCode}
                                postCode={postCode}
                            />
                        </section>

                        <section className="ib-preview-section">
                            <div className="ib-panel-header" style={{ background: '#131722', padding: '8px 16px' }}>
                                <h4 style={{ fontSize: '10px' }}>Strategy Preview Chart</h4>
                            </div>
                            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', padding: '12px' }}>
                                <Chart trades={trades} indicators={indicators} data={csvData} />
                            </div>
                        </section>
                    </div>

                    {/* Right Sidebar: AI Copilot */}
                    <aside className={`ib-sidebar-right ${isChatOpen ? 'open' : 'closed'}`}>
                        <ChatWithAI
                            isOpen={isChatOpen}
                            onClose={() => setIsChatOpen(false)}
                            initialMode="chat"
                            lockMode={true}
                            onApplyCode={handleApplyCode}
                            context={{
                                code: currentCode,
                                visConfigs: visConfigs,
                                markerConfigs: markerConfigs,
                                trigger: aiTrigger?.text
                            }}
                        />
                    </aside>
                </main>
            </div>


            {/* Custom Styles for Mini Buttons */}
            <style>{`
                .ib-btn-mini-add {
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid var(--border-dim);
                    color: var(--text-secondary);
                    width: 24px;
                    height: 24px;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .ib-btn-mini-add:hover {
                    background: var(--accent-blue);
                    color: white;
                    border-color: var(--accent-blue);
                }
                .ib-btn-icon-danger {
                    background: transparent;
                    border: none;
                    color: rgba(255, 82, 82, 0.5);
                    cursor: pointer;
                }
                .ib-btn-icon-danger:hover {
                    color: #FF5252;
                }
                .ib-title-separator {
                    height: 20px;
                    width: 1px;
                    background: var(--border-dim);
                    margin: 0 16px;
                }
                .ib-page-title {
                    font-size: 15px;
                    font-weight: 600;
                    color: #ffffff;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .ib-header-center {
                    color: var(--text-secondary);
                    font-size: 11px;
                    letter-spacing: 0.5px;
                    text-transform: uppercase;
                }
            `}</style>
        </div>
    );
};

export default IndicatorBuilder;
