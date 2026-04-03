import React, { useState, useEffect } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import TradeHistory from '../component/TradeHistory';
import Navbar from '../component/Navbar';

// Simple lightweight Line Chart component for the Equity Curve
// Since we don't have the full lightweight-charts setup here easily, 
// we will build a basic SVG line chart for the equity curve.
const EquityCurve = ({ data }) => {
    if (!data || data.length === 0) return <div style={{ color: '#8b9bb4', padding: '20px' }}>No equity curve data available.</div>;

    const width = 800;
    const height = 300;
    const padding = 40;

    const minTime = data[0].time;
    const maxTime = data[data.length - 1].time;

    // Find min/max values for Y axis scaling, adding 5% padding
    let minVal = Math.min(...data.map(d => d.value));
    let maxVal = Math.max(...data.map(d => d.value));
    const range = maxVal - minVal;
    minVal -= range * 0.05;
    maxVal += range * 0.05;

    const xScale = (t) => padding + ((t - minTime) / (maxTime - minTime || 1)) * (width - padding * 2);
    const yScale = (v) => height - padding - ((v - minVal) / (maxVal - minVal || 1)) * (height - padding * 2);

    // Create SVG path string
    const pathData = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.time)} ${yScale(d.value)}`).join(' ');

    // Create Area under the curve
    const areaPath = `${pathData} L ${xScale(data[data.length - 1].time)} ${height - padding} L ${xScale(data[0].time)} ${height - padding} Z`;

    // Is the final balance higher than the initial? Determines color.
    const isProfitable = data[data.length - 1].value >= data[0].value;
    const strokeColor = isProfitable ? '#00E676' : '#FF5252';
    const fillGradient = isProfitable ? 'url(#profitGradient)' : 'url(#lossGradient)';

    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ minHeight: '300px' }}>
            <defs>
                <linearGradient id="profitGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#00E676" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#00E676" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="lossGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#FF5252" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#FF5252" stopOpacity="0.0" />
                </linearGradient>
            </defs>

            {/* Grid Lines */}
            {[0.25, 0.5, 0.75].map(ratio => {
                const y = padding + ratio * (height - padding * 2);
                const val = maxVal - ratio * (maxVal - minVal);
                return (
                    <g key={ratio}>
                        <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#2A2E39" strokeDasharray="4,4" />
                        <text x={padding - 5} y={y + 4} fill="#8b9bb4" fontSize="10" textAnchor="end">
                            ${val.toFixed(0)}
                        </text>
                    </g>
                );
            })}

            <path d={areaPath} fill={fillGradient} />
            <path d={pathData} fill="none" stroke={strokeColor} strokeWidth="3" />

            {/* Start and End dots */}
            <circle cx={xScale(data[0].time)} cy={yScale(data[0].value)} r="4" fill={strokeColor} />
            <circle cx={xScale(data[data.length - 1].time)} cy={yScale(data[data.length - 1].value)} r="6" fill={strokeColor} stroke="#1E222D" strokeWidth="2" />
        </svg>
    );
};


const Analytics = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [trades, setTrades] = useState([]);
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Retrieve trades passed via router state
        const passedTrades = location.state?.trades || [];
        setTrades(passedTrades);

        if (passedTrades.length === 0) {
            setLoading(false);
            return;
        }

        const fetchAnalytics = async () => {
            try {
                // Use relative path relying on package.json proxy configuration
                const response = await fetch('/api/analytics/calculate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ trades: passedTrades, initialBalance: 10000 })
                });

                if (!response.ok) throw new Error("Failed to calculate metrics");

                const data = await response.json();
                setMetrics(data);
                setLoading(false);
            } catch (err) {
                console.error("Analytics error:", err);
                setError(err.message);
                setLoading(false);
            }
        };

        fetchAnalytics();
    }, [location.state]);

    // UI Helper for KPI Cards
    const MetricCard = ({ title, value, unit, isPositive = null, tooltip }) => {
        let color = '#D1D4DC';
        if (isPositive === true) color = '#00E676';
        if (isPositive === false) color = '#FF5252';

        return (
            <div style={{
                background: 'rgba(30, 34, 45, 0.85)',
                border: '1px solid #2A2E39',
                borderRadius: '12px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
            }} title={tooltip}>
                <div style={{ fontSize: '12px', color: '#8b9bb4', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>
                    {title}
                </div>
                <div style={{ fontSize: '32px', fontWeight: '800', color: color, letterSpacing: '-1px' }}>
                    {value}<span style={{ fontSize: '16px', color: '#8b9bb4', marginLeft: '4px' }}>{unit}</span>
                </div>
            </div>
        );
    };

    return (
        <div style={{
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
            minHeight: '100vh',
            background: 'radial-gradient(circle at 50% 0%, #1c212e 0%, #131722 100%)',
            color: '#D1D4DC',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box'
        }}>
            <Navbar />
            <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2A2E39', paddingBottom: '16px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '36px', fontWeight: '800', background: 'linear-gradient(90deg, #ffffff, #8b9bb4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-1px' }}>
                        Strategy Tear Sheet
                    </h1>
                    <p style={{ margin: '8px 0 0 0', color: '#8b9bb4', fontSize: '14px' }}>Quantitative performance analysis and risk metrics.</p>
                </div>
                <button
                    onClick={() => navigate(-1)}
                    style={{
                        padding: '10px 20px',
                        background: 'transparent',
                        color: '#00E5FF',
                        border: '1px solid rgba(0, 229, 255, 0.3)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '14px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        transition: 'all 0.3s'
                    }}
                    onMouseOver={(e) => { e.target.style.background = 'rgba(0, 229, 255, 0.1)'; e.target.style.boxShadow = '0 0 15px rgba(0, 229, 255, 0.3)'; }}
                    onMouseOut={(e) => { e.target.style.background = 'transparent'; e.target.style.boxShadow = 'none'; }}
                >
                    &larr; Back to Terminal
                </button>
            </div>

            {loading ? (
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '24px', color: '#8b9bb4' }}>
                    Crunching the numbers...
                </div>
            ) : error ? (
                <div style={{ padding: '20px', background: 'rgba(255, 82, 82, 0.1)', border: '1px solid #FF5252', borderRadius: '8px', color: '#FF5252' }}>
                    Error calculating metrics: {error}
                </div>
            ) : trades.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '20px', color: '#8b9bb4' }}>
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    <div style={{ fontSize: '20px' }}>No trades to analyze.</div>
                    <div>Run a simulation in the Terminal first, then click "Analyze Strategy".</div>
                    <button
                        onClick={() => navigate('/')}
                        style={{ padding: '12px 24px', background: '#2962FF', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                        Go to Terminal
                    </button>
                </div>
            ) : (
                <>
                    {/* KPI Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
                        <MetricCard
                            title="Net Return"
                            value={metrics.totalReturn}
                            unit="%"
                            isPositive={parseFloat(metrics.totalReturn) >= 0}
                            tooltip="Total percentage growth of the portfolio."
                        />
                        <MetricCard
                            title="Win Rate"
                            value={metrics.winRate}
                            unit="%"
                            isPositive={parseFloat(metrics.winRate) > 50}
                            tooltip="Percentage of closed trades that were profitable."
                        />
                        <MetricCard
                            title="Max Drawdown"
                            value={metrics.maxDrawdown}
                            unit="%"
                            isPositive={parseFloat(metrics.maxDrawdown) < 15}
                            tooltip="The largest peak-to-trough drop in account balance. Lower is safer."
                        />
                        <MetricCard
                            title="Sharpe Ratio"
                            value={metrics.sharpeRatio}
                            unit=""
                            isPositive={parseFloat(metrics.sharpeRatio) > 1}
                            tooltip="Risk-adjusted return. >1 is good, >2 is excellent."
                        />
                        <MetricCard
                            title="Total Trades"
                            value={metrics.totalTrades}
                            unit=""
                            tooltip="Number of closed round-trip trades executed."
                        />
                    </div>

                    {/* Equity Curve Chart */}
                    <div style={{ background: 'rgba(30, 34, 45, 0.85)', border: '1px solid #2A2E39', borderRadius: '12px', padding: '24px' }}>
                        <div style={{ fontSize: '16px', fontWeight: '600', color: '#D1D4DC', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            Equity Curve <span style={{ color: '#8b9bb4', fontSize: '14px', fontWeight: 'normal' }}>($10,000 Starting Balance)</span>
                        </div>
                        <div style={{ width: '100%', height: '350px', background: '#131722', borderRadius: '8px', border: '1px solid #363C4E', padding: '10px' }}>
                            <EquityCurve data={metrics.equityCurveData} />
                        </div>
                    </div>

                    {/* Trade Blotter Log */}
                    <div style={{ flex: 1, minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: '16px', fontWeight: '600', color: '#D1D4DC', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            Trade Execution Log
                        </div>
                        <div style={{ flex: 1, borderRadius: '12px', overflow: 'hidden', border: '1px solid #2A2E39', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                            <TradeHistory trades={trades} />
                        </div>
                    </div>
                </>
            )}
            </div>
        </div>
    );
};

export default Analytics;
