import React, { useState, useEffect } from 'react';
import Chart from '../component/chart';
import CodePlace from '../component/code_place';
import TradeHistory from '../component/TradeHistory';
import Navbar from '../component/Navbar';
import ChatWithAI from '../component/ChatWithAI';

const Terminal = () => {
    const [trades, setTrades] = useState([]);
    const [indicators, setIndicators] = useState([]);
    const [csvData, setCsvData] = useState(null);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [currentCode, setCurrentCode] = useState('');

    // Handler for simulation results
    const handleSimulationResults = (result) => {
        if (Array.isArray(result)) {
            setTrades(result);
            setIndicators([]);
        } else if (result && typeof result === 'object') {
            if (result.trades) setTrades(result.trades);
            if (result.indicators) setIndicators(result.indicators);
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
    }, []);

    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#101922',
            color: '#cbd5e1',
            fontFamily: "'Inter', sans-serif",
            overflow: 'hidden'
        }}>
            <Navbar />
            
            {/* Toolbar / Header Extensions */}
            <div style={{ 
                height: '48px', 
                background: '#161b22', 
                borderBottom: '1px solid #283039',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-symbols-outlined" style={{ color: '#58a6ff', fontSize: '20px' }}>terminal</span>
                        <span style={{ fontWeight: 600, fontSize: '13px', letterSpacing: '0.5px' }}>TRADING TERMINAL</span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button 
                        onClick={() => setIsChatOpen(!isChatOpen)}
                        style={{
                            background: isChatOpen ? 'rgba(88, 166, 255, 0.15)' : 'transparent',
                            color: isChatOpen ? '#58a6ff' : '#8b949e',
                            border: isChatOpen ? '1px solid #58a6ff' : '1px solid #30363d',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 600,
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>smart_toy</span>
                        BullPeak AI Assist
                    </button>
                </div>
            </div>

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Fira+Code:wght@400;500&display=swap');
                
                body { margin: 0; }
                
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: #111418; }
                ::-webkit-scrollbar-thumb { background: #3b4754; border-radius: 10px; }
                ::-webkit-scrollbar-thumb:hover { background: #137fec; }
            `}</style>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Main Workspace Area */}
                <main style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#101922', minWidth: 0 }}>
                    {/* Split Panel (Chart and Editor) */}
                    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
                        {/* Left: Chart */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #283039' }}>
                            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                                <Chart trades={trades} indicators={indicators} data={csvData} />
                            </div>
                        </div>

                        {/* Right: Code Editor */}
                        <div style={{ width: '450px', display: 'flex', flexDirection: 'column', backgroundColor: '#0d1117' }}>
                            <CodePlace 
                                onTradesGenerated={handleSimulationResults} 
                                onCodeChange={setCurrentCode}
                                showAICopilot={false} 
                            />
                        </div>
                    </div>

                    {/* Bottom Panel (Trade History) */}
                    <div style={{ height: '30%', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0f16', borderTop: '1px solid #283039' }}>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            <TradeHistory trades={trades} />
                        </div>
                    </div>
                </main>

                {/* Right Sidebar: AI Assistant */}
                <aside style={{ height: '100%', display: 'flex' }}>
                    <ChatWithAI 
                        isOpen={isChatOpen} 
                        onClose={() => setIsChatOpen(false)} 
                        initialMode="strategy"
                        lockMode={true}
                        context={{
                            code: currentCode
                        }}
                    />
                </aside>
            </div>
        </div>
    );
};

export default Terminal;
