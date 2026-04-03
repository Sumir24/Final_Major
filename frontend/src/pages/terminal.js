import React, { useState, useEffect } from 'react';
import Chart from '../component/chart';
import CodePlace from '../component/code_place';
import TradeHistory from '../component/TradeHistory';
import Navbar from '../component/Navbar';

const Terminal = () => {
    const [trades, setTrades] = useState([]);
    const [indicators, setIndicators] = useState([]);
    const [csvData, setCsvData] = useState(null);

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
                            <CodePlace onTradesGenerated={handleSimulationResults} />
                        </div>
                    </div>

                    {/* Bottom Panel (Trade History) */}
                    <div style={{ height: '30%', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0f16', borderTop: '1px solid #283039' }}>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            <TradeHistory trades={trades} />
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default Terminal;
