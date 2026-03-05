import React, { useState } from 'react';

const IndicatorShow = ({ indicators, onSaveSetup }) => {
    const [indicatorName, setIndicatorName] = useState('');

    if (!indicators || indicators.length === 0) {
        return (
            <div style={{ padding: '20px', background: '#1E1E1E', border: '1px solid #333', borderRadius: '8px', color: '#888', textAlign: 'center' }}>
                No indicators to show. Run the simulation to generate indicators.
            </div>
        );
    }

    const handleSave = () => {
        if (!indicatorName.trim()) {
            alert('Please enter a name for your indicator setup.');
            return;
        }
        if (onSaveSetup) {
            onSaveSetup(indicatorName);
            setIndicatorName(''); // Clear input after save
        }
    };

    return (
        <div style={{ padding: '15px', background: '#1E1E1E', border: '1px solid #333', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0, color: '#e0e0e0', fontSize: '16px' }}>Generated Indicators</h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                        type="text"
                        value={indicatorName}
                        onChange={(e) => setIndicatorName(e.target.value)}
                        placeholder="Enter Setup Name..."
                        style={{ padding: '8px', borderRadius: '4px', border: '1px solid #555', background: '#333', color: '#fff' }}
                    />
                    <button
                        onClick={handleSave}
                        style={{ padding: '8px 15px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        Save Setup
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
                {indicators.map((ind, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#2C2C2C', padding: '10px 15px', borderRadius: '6px' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: ind.color || '#fff' }}></div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 'bold', color: '#fff', fontSize: '14px' }}>{ind.name}</span>
                            <span style={{ color: '#aaa', fontSize: '12px' }}>Type: {ind.type}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default IndicatorShow;
