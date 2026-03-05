import React, { useState, useEffect } from 'react';
import Chart from '../component/chart';
import CodePlace from '../component/code_place';
import TradeHistory from '../component/TradeHistory';
import { Link, useNavigate } from 'react-router-dom';

const Terminal = () => {
    const navigate = useNavigate();
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
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            height: '100vh',
            boxSizing: 'border-box',
            background: 'radial-gradient(circle at 50% 0%, #1c212e 0%, #131722 100%)',
            color: '#D1D4DC'
        }}>
            <style>{`
                .premium-link {
                    color: #00E5FF;
                    text-decoration: none;
                    font-size: 14px;
                    font-weight: 600;
                    padding: 8px 16px;
                    background: rgba(0, 229, 255, 0.1);
                    border: 1px solid rgba(0, 229, 255, 0.2);
                    border-radius: 6px;
                    transition: all 0.3s ease;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .premium-link:hover {
                    box-shadow: 0 0 15px rgba(0, 229, 255, 0.4);
                    background: rgba(0, 229, 255, 0.2);
                    transform: translateY(-1px);
                }
                .panel-glass {
                    border: 1px solid #2A2E39;
                    background: rgba(30, 34, 45, 0.85);
                    backdrop-filter: blur(10px);
                    border-radius: 12px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                }
                .header-title {
                    margin: 0;
                    font-size: 28px;
                    font-weight: 800;
                    letter-spacing: -0.5px;
                    background: linear-gradient(90deg, #ffffff, #8b9bb4);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                ::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                }
                ::-webkit-scrollbar-track {
                    background: #131722; 
                }
                ::-webkit-scrollbar-thumb {
                    background: #2A2E39; 
                    border-radius: 4px;
                }
                ::-webkit-scrollbar-thumb:hover {
                    background: #363C4E; 
                }
            `}</style>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid #2A2E39' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#00E676', boxShadow: '0 0 10px #00E676' }}></div>
                    <h1 className="header-title">Quantum Terminal</h1>
                </div>
                <Link to="/indicator-builder" className="premium-link">Indicator Builder &rarr;</Link>
            </div>

            {/* Top Area: Chart (Left) + Code (Right) */}
            <div style={{ display: 'flex', gap: '24px', flex: '1 1 60%', minHeight: 0 }}>
                {/* Chart Section */}
                <div className="panel-glass" style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Chart trades={trades} indicators={indicators} data={csvData} />
                    </div>
                </div>

                {/* Editor Section */}
                <div className="panel-glass" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <CodePlace onTradesGenerated={handleSimulationResults} />
                </div>
            </div>

            {/* Bottom Area: Trade History */}
            <div className="panel-glass" style={{ flex: '0 0 30%', minHeight: '200px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #2A2E39', background: 'rgba(20, 24, 34, 0.5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: '600', fontSize: '14px', color: '#8b9bb4', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Trade Blotter
                    </div>
                    {trades.length > 0 && (
                        <button
                            onClick={() => navigate('/analytics', { state: { trades } })}
                            style={{
                                padding: '6px 12px',
                                background: 'transparent',
                                color: '#00E676',
                                border: '1px solid rgba(0, 230, 118, 0.3)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                fontSize: '12px',
                                textTransform: 'uppercase',
                                transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => { e.target.style.background = 'rgba(0, 230, 118, 0.1)'; e.target.style.boxShadow = '0 0 10px rgba(0, 230, 118, 0.3)'; }}
                            onMouseOut={(e) => { e.target.style.background = 'transparent'; e.target.style.boxShadow = 'none'; }}
                        >
                            Analyze Strategy &rarr;
                        </button>
                    )}
                </div>
                <div style={{ flex: 1, width: '100%', overflow: 'hidden', padding: '10px' }}>
                    <TradeHistory trades={trades} />
                </div>
            </div>
        </div>
    );
};

export default Terminal;
