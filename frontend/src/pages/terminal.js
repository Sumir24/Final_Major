import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Chart from '../component/chart';
import CodePlace from '../component/code_place';
import TradeHistory from '../component/TradeHistory';
import Navbar from '../component/Navbar';
import ChatWithAI from '../component/ChatWithAI';
import FileExplorer from '../component/FileExplorer';

const PanelContainer = React.memo(({ children, title, icon, style = {}, actions = null }) => (
    <div style={{
        display: 'flex',
        flexDirection: 'column',
        background: '#131315',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
        transition: 'transform 0.2s ease',
        ...style
    }}>
        {title && (
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(255, 255, 255, 0.02)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#00dbe9' }}>{icon}</span>
                    <span style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: '#8b9bb4' }}>{title}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {actions}
                    <span className="material-symbols-outlined" style={{ fontSize: '14px', color: '#30363d', cursor: 'pointer' }}>settings</span>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px', color: '#30363d', cursor: 'pointer' }}>fullscreen</span>
                </div>
            </div>
        )}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {children}
        </div>
    </div>
));

const Terminal = () => {
    const [trades, setTrades] = useState([]);
    const [indicators, setIndicators] = useState([]);
    const [csvData, setCsvData] = useState(null);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [currentCode, setCurrentCode] = useState('');
    const [selectedFileName, setSelectedFileName] = useState('data.csv');

    // Preview & Inspection State
    const [inspectedData, setInspectedData] = useState(null);
    const [activeBottomTab, setActiveBottomTab] = useState('execution'); // 'execution' or 'inspector'

    // Handler for simulation results - Wrapped in useCallback for performance
    const handleSimulationResults = useCallback((result) => {
        if (Array.isArray(result)) {
            setTrades(result);
            setIndicators([]);
        } else if (result && typeof result === 'object') {
            if (result.trades) setTrades(result.trades);
            if (result.indicators) setIndicators(result.indicators);
        }
    }, []);

    const loadFileContent = async (fileId, fileName) => {
        try {
            const response = await fetch(`/api/files/content/${fileId}`);
            if (!response.ok) throw new Error("Failed to fetch data");
            const text = await response.text();
            setCsvData(text);
            setSelectedFileName(fileName);
        } catch (err) {
            console.error("Error loading data from MongoDB:", err);
        }
    };

    const handleFilePreview = async (item) => {
        try {
            const response = await fetch(`/api/files/content/${item.id}`);
            if (!response.ok) throw new Error("Failed to fetch preview");
            const text = await response.text();

            // Parse CSV for inspector
            const rows = text.split('\n').map(row => row.split(','));
            setInspectedData({
                name: item.name,
                rows: rows.slice(0, 1000), // Preview first 1000 rows
                totalRows: rows.length
            });
            setActiveBottomTab('inspector');
        } catch (err) {
            console.error("Preview error:", err);
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
                console.error("Error loading default data:", err);
            }
        };
        fetchData();
    }, []);

    const handleFileSelect = (item) => {
        if (item.isDirectory) return;
        loadFileContent(item.id, item.name);
    };

    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'row',
            backgroundColor: '#0A0A0B',
            color: '#D1D4DC',
            fontFamily: "'Inter', sans-serif",
            overflow: 'hidden'
        }}>
            <Navbar />

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowX: 'auto', overflowY: 'hidden' }}>
                {/* Cockpit Header */}
                <div style={{
                    height: '60px',
                    background: 'linear-gradient(to right, #131314, #0A0A0B)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 24px',
                    zIndex: 10
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00E676', boxShadow: '0 0 10px rgba(0, 230, 118, 0.5)' }}></div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '10px', fontWeight: '800', color: '#ffffff', letterSpacing: '0.5px' }}>BULLPEAK CORE</span>
                                <span style={{ fontSize: '9px', color: '#5f6368', fontWeight: '600' }}>v4.2.0-STABLE</span>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <button
                            onClick={() => setIsChatOpen(!isChatOpen)}
                            className="cockpit-btn"
                            style={{
                                background: isChatOpen ? 'rgba(0, 219, 233, 0.1)' : 'transparent',
                                color: isChatOpen ? '#00dbe9' : '#8b949e',
                                borderColor: isChatOpen ? 'rgba(0, 219, 233, 0.3)' : 'rgba(255, 255, 255, 0.1)'
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>analytics</span>
                            CO-PILOT
                        </button>
                    </div>
                </div>

                <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '16px', gap: '16px', minHeight: 0 }}>
                    {/* Project Explorer */}
                    <div style={{ width: '260px', display: 'flex', flexShrink: 0 }}>
                        <PanelContainer title="Project Assets" icon="folder_shared" style={{ flex: 1 }}>
                            <FileExplorer
                                onFileSelect={handleFileSelect}
                                onFilePreview={handleFilePreview}
                            />
                        </PanelContainer>
                    </div>

                    {/* Main Stage Area */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
                        <div style={{ flex: 1.5, display: 'flex', gap: '16px', minHeight: 0 }}>
                            <PanelContainer title={`Technical Perspective [${selectedFileName}]`} icon="show_chart" style={{ flex: 1.5 }}>
                                <Chart trades={trades} indicators={indicators} data={csvData} />
                            </PanelContainer>

                            <div style={{ width: '480px', display: 'flex', flexShrink: 0 }}>
                                <PanelContainer title="Strategy Forge" icon="construction" style={{ flex: 1 }}>
                                    <CodePlace
                                        onTradesGenerated={handleSimulationResults}
                                        onCodeChange={setCurrentCode}
                                        codeProp={currentCode}
                                        showAICopilot={false}
                                    />
                                </PanelContainer>
                            </div>
                        </div>

                        {/* Bottom Perspective: Multi-Tab Ledger */}
                        <div style={{ height: '32%', display: 'flex' }}>
                            <PanelContainer
                                title={activeBottomTab === 'execution' ? "Execution Ledger" : `Data Inspector [${inspectedData?.name || '...'}]`}
                                icon={activeBottomTab === 'execution' ? "list_alt" : "database"}
                                style={{ flex: 1 }}
                                actions={(
                                    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '2px', marginRight: '12px' }}>
                                        <button
                                            onClick={() => setActiveBottomTab('execution')}
                                            style={{
                                                padding: '4px 12px',
                                                border: 'none',
                                                borderRadius: '4px',
                                                fontSize: '9px',
                                                fontWeight: '800',
                                                cursor: 'pointer',
                                                background: activeBottomTab === 'execution' ? 'rgba(0, 219, 233, 0.15)' : 'transparent',
                                                color: activeBottomTab === 'execution' ? '#00dbe9' : '#5f6368',
                                            }}
                                        >TRADES</button>
                                        <button
                                            onClick={() => setActiveBottomTab('inspector')}
                                            style={{
                                                padding: '4px 12px',
                                                border: 'none',
                                                borderRadius: '4px',
                                                fontSize: '9px',
                                                fontWeight: '800',
                                                cursor: 'pointer',
                                                background: activeBottomTab === 'inspector' ? 'rgba(0, 219, 233, 0.15)' : 'transparent',
                                                color: activeBottomTab === 'inspector' ? '#00dbe9' : '#5f6368',
                                            }}
                                        >DATASET</button>
                                    </div>
                                )}
                            >
                                {activeBottomTab === 'execution' ? (
                                    <TradeHistory trades={trades} />
                                ) : (
                                    <div style={{ height: '100%', overflow: 'auto', padding: '12px', backgroundColor: '#0D0D0F' }}>
                                        {!inspectedData ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#5f6368', gap: '12px' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: '48px', opacity: 0.2 }}>search_insights</span>
                                                <span style={{ fontSize: '11px', fontWeight: '600' }}>SELECT A FILE TO INSPECT DATA</span>
                                            </div>
                                        ) : (
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', color: '#8b949e' }}>
                                                <thead style={{ position: 'sticky', top: 0, background: '#131315', zIndex: 1 }}>
                                                    <tr>
                                                        {inspectedData.rows[0]?.map((header, i) => (
                                                            <th key={i} style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#D1D4DC' }}>{header}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {inspectedData.rows.slice(1).map((row, i) => (
                                                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                            {row.map((cell, j) => (
                                                                <td key={j} style={{ padding: '6px 8px' }}>{cell}</td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                )}
                            </PanelContainer>
                        </div>
                    </div>

                    <aside style={{ height: '100%', display: isChatOpen ? 'flex' : 'none' }}>
                        <ChatWithAI
                            isOpen={isChatOpen}
                            onClose={() => setIsChatOpen(false)}
                            initialMode="strategy"
                            lockMode={true}
                            onApplyCode={setCurrentCode}
                            context={useMemo(() => ({
                                code: currentCode
                            }), [currentCode])}
                        />
                    </aside>
                </div>

                <div style={{
                    height: '28px',
                    background: '#0D0D10',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 16px',
                    fontSize: '10px',
                    color: '#4a4a4e',
                    fontWeight: 600
                }}>
                    <div style={{ display: 'flex', gap: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: '#00E676' }}>●</span>
                            GATEWAY CONNECTED [SYD-1]
                        </div>
                        <div>LATENCY: 14ms</div>
                    </div>
                    <div style={{ display: 'flex', gap: '20px' }}>
                        <div>MEMORY: 42%</div>
                        <div style={{ color: '#8b9bb4' }}>{new Date().toISOString()}</div>
                    </div>
                </div>
            </div>

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@500&display=swap');
                body { margin: 0; background: #0A0A0B; }
                .cockpit-btn {
                    padding: 8px 16px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    font-size: 11px;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .cockpit-btn:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.2); color: #fff; }
                ::-webkit-scrollbar { width: 4px; height: 4px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
                ::-webkit-scrollbar-thumb:hover { background: #00dbe9; }
            `}</style>
        </div>
    );
};

export default Terminal;
