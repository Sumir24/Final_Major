import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, LineStyle } from 'lightweight-charts';

const timeframes = [
    { label: '1m', value: '1m', duration: 1 },
    { label: '5m', value: '5m', duration: 5 },
    { label: '15m', value: '15m', duration: 15 },
    { label: '1h', value: '1h', duration: 60 },
    { label: '4h', value: '4h', duration: 240 },
    { label: '1D', value: '1d', duration: 1440 },
];

const Chart = ({ trades = [], indicators = [], data: csvData, symbol = "Forex / EURUSD" }) => {
    const chartContainerRef = useRef();
    const chartRef = useRef(null);
    const legendRef = useRef(null);
    const candlestickSeriesRef = useRef(null);
    const m1DataRef = useRef([]); // Store raw M1 data

    const [activeTimeframe, setActiveTimeframe] = useState('1m');

    // Aggregation Function
    const aggregateData = (data, minutes) => {
        if (minutes === 1) return data;

        const intervalSeconds = minutes * 60;
        const aggregated = [];
        let currentBucket = null;

        for (const candle of data) {
            const bucketTime = Math.floor(candle.time / intervalSeconds) * intervalSeconds;

            if (!currentBucket || currentBucket.time !== bucketTime) {
                if (currentBucket) {
                    aggregated.push(currentBucket);
                }
                currentBucket = {
                    time: bucketTime,
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close,
                };
            } else {
                currentBucket.high = Math.max(currentBucket.high, candle.high);
                currentBucket.low = Math.min(currentBucket.low, candle.low);
                currentBucket.close = candle.close;
            }
        }
        if (currentBucket) aggregated.push(currentBucket);

        return aggregated;
    };

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: '#080808' },
                textColor: '#DDD',
            },
            leftPriceScale: {
                visible: false, // Cleaner look
                borderColor: '#1e222d',
            },
            rightPriceScale: {
                visible: true,
                borderColor: '#1e222d',
            },
            grid: {
                vertLines: { color: 'rgba(30, 34, 45, 0.4)' },
                horzLines: { color: 'rgba(30, 34, 45, 0.4)' },
            },
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight || 500,
            attributionLogo: false,
            crosshair: {
                vertLine: {
                    color: '#758696',
                    width: 1,
                    style: LineStyle.Dashed,
                    labelBackgroundColor: '#758696',
                },
                horzLine: {
                    color: '#758696',
                    width: 1,
                    style: LineStyle.Dashed,
                    labelBackgroundColor: '#758696',
                },
            },
        });

        chartRef.current = chart;

        const candlestickSeries = chart.addCandlestickSeries({
            upColor: '#00c076',
            downColor: '#ff3b30',
            borderVisible: false,
            wickUpColor: '#00c076',
            wickDownColor: '#ff3b30',
        });
        candlestickSeriesRef.current = candlestickSeries;

        const updateLegend = (param) => {
            if (!legendRef.current) return;
            const data = param.seriesData ? param.seriesData.get(candlestickSeries) : param;

            if (data) {
                const open = data.open.toFixed(5);
                const high = data.high.toFixed(5);
                const low = data.low.toFixed(5);
                const close = data.close.toFixed(5);
                const isUp = data.close >= data.open;
                const color = isUp ? '#00c076' : '#ff3b30';

                const change = ((data.close - data.open) / data.open * 100).toFixed(2);
                const changeSign = change >= 0 ? '+' : '';

                legendRef.current.innerHTML = `
                    <div style="
                        background: rgba(19, 23, 34, 0.7);
                        backdrop-filter: blur(8px);
                        border: 1px solid rgba(42, 46, 57, 0.5);
                        padding: 12px 16px;
                        border-radius: 8px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                        min-width: 180px;
                        pointer-events: none;
                    ">
                        <div style="font-size: 13px; font-weight: 500; color: #8b9bb4; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                            ${symbol}
                        </div>
                        <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px;">
                            <span style="font-size: 24px; font-weight: 700; color: #fff; letter-spacing: -0.5px;">${close}</span>
                            <span style="font-size: 14px; font-weight: 600; color: ${color};">${changeSign}${change}%</span>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; color: #8b9bb4;">
                            <div>O: <span style="color: #d1d4dc">${open}</span></div>
                            <div>H: <span style="color: #d1d4dc">${high}</span></div>
                            <div>L: <span style="color: #d1d4dc">${low}</span></div>
                            <div>C: <span style="color: #d1d4dc">${close}</span></div>
                        </div>
                    </div>
                `;
            }

            // Update floating tooltip
            const toolTip = document.getElementById('chart-tooltip');
            if (toolTip) {
                if (!param.point || !param.time || !data) {
                    toolTip.style.display = 'none';
                    return;
                }

                let tooltipHtml = '';
                if (param.seriesData && indicators) {
                    indicators.forEach((ind, index) => {
                        const series = indicatorSeriesRef.current[index];
                        if (series) {
                            const indData = param.seriesData.get(series);
                            if (indData && indData.value !== undefined) {
                                tooltipHtml += `<div style="font-size: 12px; font-weight: bold; color: ${ind.color || '#DDD'}">${ind.name}: ${indData.value.toFixed(4)}</div>`;
                            }
                        }
                    });
                }

                if (tooltipHtml) {
                    toolTip.style.display = 'block';
                    toolTip.innerHTML = tooltipHtml;
                } else {
                    toolTip.style.display = 'none';
                }
            }
        };

        const handleMouseMove = (e) => {
            const toolTip = document.getElementById('chart-tooltip');
            if (toolTip && toolTip.style.display === 'block') {
                const rect = chartContainerRef.current.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                toolTip.style.left = x + 15 + 'px';
                toolTip.style.top = y + 15 + 'px';
            }
        };

        chartContainerRef.current.addEventListener('mousemove', handleMouseMove);

        if (!csvData) {
            // Still need to handle resize even if no data
            const resizeObserver = new ResizeObserver(entries => {
                if (entries.length === 0 || entries[0].target !== chartContainerRef.current) { return; }
                const newRect = entries[0].contentRect;
                chart.applyOptions({ width: newRect.width, height: newRect.height });
            });
            resizeObserver.observe(chartContainerRef.current);
            return () => {
                chartContainerRef.current?.removeEventListener('mousemove', handleMouseMove);
                resizeObserver.disconnect();
                chart.remove();
            };
        }

        const lines = csvData.split('\n');
        const parsedData = lines.map(line => {
            const parts = line.split(';');
            if (parts.length < 6) return null;

            const dateStr = parts[0];
            const year = parseInt(dateStr.substring(0, 4));
            const month = parseInt(dateStr.substring(4, 6)) - 1;
            const day = parseInt(dateStr.substring(6, 8));
            const hour = parseInt(dateStr.substring(9, 11));
            const minute = parseInt(dateStr.substring(11, 13));
            const second = parseInt(dateStr.substring(13, 15));

            const time = new Date(Date.UTC(year, month, day, hour, minute, second)).getTime() / 1000;

            if (isNaN(time)) return null;

            return {
                time: time,
                open: parseFloat(parts[1]),
                high: parseFloat(parts[2]),
                low: parseFloat(parts[3]),
                close: parseFloat(parts[4]),
            };
        }).filter(item => item !== null);

        parsedData.sort((a, b) => a.time - b.time);

        // Remove duplicates
        const uniqueData = [];
        let lastTime = null;
        for (const item of parsedData) {
            if (item.time !== lastTime) {
                uniqueData.push(item);
                lastTime = item.time;
            }
        }

        m1DataRef.current = uniqueData;

        // Initial Load (1m)
        if (uniqueData.length > 0) {
            console.log("Chart Range (Candles):", {
                start: new Date(uniqueData[0].time * 1000).toISOString(),
                end: new Date(uniqueData[uniqueData.length - 1].time * 1000).toISOString()
            });
            candlestickSeries.setData(uniqueData);
            chart.timeScale().fitContent();
            updateLegend(uniqueData[uniqueData.length - 1]);
        }


        chart.subscribeCrosshairMove(updateLegend);

        // Resize Observer
        const resizeObserver = new ResizeObserver(entries => {
            if (entries.length === 0 || entries[0].target !== chartContainerRef.current) { return; }
            const newRect = entries[0].contentRect;

            // Debounce / Check if update is needed
            if (newRect.width === 0 || newRect.height === 0) return;

            // Wrap in requestAnimationFrame
            window.requestAnimationFrame(() => {
                if (chartRef.current) {
                    // Only apply if width actually changed (optional optimization, but good practice)
                    chart.applyOptions({ width: newRect.width, height: newRect.height });
                }
            });
        });

        resizeObserver.observe(chartContainerRef.current);

        return () => {
            chartContainerRef.current?.removeEventListener('mousemove', handleMouseMove);
            resizeObserver.disconnect();
            chart.remove();
        };
    }, [csvData]);

    // Handle Timeframe Change
    useEffect(() => {
        if (!m1DataRef.current.length || !candlestickSeriesRef.current) return;

        const selectedTF = timeframes.find(tf => tf.value === activeTimeframe);
        const aggregatedData = aggregateData(m1DataRef.current, selectedTF.duration);

        candlestickSeriesRef.current.setData(aggregatedData);
        if (chartRef.current) chartRef.current.timeScale().fitContent();

    }, [activeTimeframe]);

    // Use a ref to track indicator series instances for cleanup
    const indicatorSeriesRef = useRef([]);

    // Manage Indicators
    useEffect(() => {
        if (!chartRef.current || !m1DataRef.current.length) return;

        // Cleanup previous indicators
        indicatorSeriesRef.current.forEach(series => {
            chartRef.current.removeSeries(series);
        });
        indicatorSeriesRef.current = [];

        if (indicators && indicators.length > 0) {
            console.log("Indicators to plot:", indicators.map(i => ({ name: i.name, dataCount: i.data?.length, overlay: i.overlay })));
            if (indicators[0].data && indicators[0].data.length > 0 && m1DataRef.current.length > 0) {
                 console.log("First Indicator Pnt vs First Candle:", {
                     ind: new Date(indicators[0].data[0].time * 1000).toISOString(),
                     cnd: new Date(m1DataRef.current[0].time * 1000).toISOString()
                 });
            }
        }

        if (!indicators || indicators.length === 0) {
            chartRef.current.priceScale('right').applyOptions({
                scaleMargins: { top: 0.1, bottom: 0.1 }
            });
            return;
        }

        const processedIndicators = indicators.map(ind => {
            if (!ind.data || ind.data.length === 0) return { ...ind, valid: false };

            let isOverlay = true;
            if (ind.overlay !== undefined) {
                isOverlay = ind.overlay;
            } else if (m1DataRef.current.length > 0) {
                const firstIndValue = ind.data[0].value;
                const samplePrice = m1DataRef.current[0].close;
                if (Math.abs(firstIndValue - samplePrice) / samplePrice > 0.3) {
                    isOverlay = false;
                }
            }
            return { ...ind, valid: true, isOverlay };
        }).filter(ind => ind.valid);

        const totalPanes = processedIndicators.filter(ind => !ind.isOverlay).length;
        let paneIndex = 0;

        processedIndicators.forEach(ind => {
            let targetScaleId;

            if (ind.isOverlay) {
                targetScaleId = 'right';
            } else {
                targetScaleId = `pane_${paneIndex}`;
                paneIndex++;
            }

            let series;
            if (ind.type === 'line') {
                series = chartRef.current.addLineSeries({
                    color: ind.color || '#2962FF',
                    lineWidth: 2,
                    priceScaleId: targetScaleId,
                });
            } else if (ind.type === 'histogram') {
                // For histograms (usually volume), we use a separate scale so it doesn't squash the price
                series = chartRef.current.addHistogramSeries({
                    color: ind.color || '#26a69a',
                    priceFormat: {
                        type: 'volume',
                    },
                    priceScaleId: targetScaleId,
                });
            }

            if (series) {
                // Ensure data is sorted
                const sortedData = [...ind.data].sort((a, b) => a.time - b.time);

                // Deduplicate data
                const uniqueData = [];
                let lastTime = null;
                for (const item of sortedData) {
                    if (item.time !== lastTime) {
                        uniqueData.push(item);
                        lastTime = item.time;
                    }
                }

                series.setData(uniqueData);
                indicatorSeriesRef.current.push(series);

                // Set margins to allocate space dynamically (e.g., 20% height for each pane)
                // This MUST be done AFTER the series is created, so the scaleId exists
                if (!ind.isOverlay) {
                    const i = paneIndex - 1; // Since we incremented it earlier
                    const paneHeight = 0.2;
                    chartRef.current.priceScale(targetScaleId).applyOptions({
                        scaleMargins: {
                            top: 1.0 - (totalPanes - i) * paneHeight,
                            bottom: (totalPanes - i - 1) * paneHeight,
                        }
                    });
                }
            }
        });

        // Adjust main axis so it leaves space at the bottom for panes if there are any
        chartRef.current.priceScale('right').applyOptions({
            autoScale: true,
            scaleMargins: {
                top: 0.1,
                bottom: totalPanes > 0 ? (totalPanes * 0.2) + 0.05 : 0.1,
            }
        });

    }, [indicators, csvData]);

    // Update markers when trades change
    useEffect(() => {
        if (!candlestickSeriesRef.current || !trades) return;

        console.log("Trades received in Chart:", trades.length);

        const markers = trades.filter(t => t && t.type).map(trade => {
            const isBuy = trade.type === 'buy';
            const tradeColor = trade.color ? trade.color : (isBuy ? '#00c076' : '#ff3b30');

            return {
                time: trade.time,
                position: isBuy ? 'belowBar' : 'aboveBar',
                color: tradeColor,
                shape: isBuy ? 'arrowUp' : 'arrowDown',
                text: (isBuy ? 'B' : 'S'), // Compact label (B/S)
                size: 2, // Larger for better visibility
            };
        });

        // Sort markers by time (required by Lightweight Charts)
        markers.sort((a, b) => a.time - b.time);

        candlestickSeriesRef.current.setMarkers(markers);
    }, [trades]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Toolbar */}
            <div style={{
                padding: '10px',
                background: '#080808',
                borderBottom: '1px solid #1e222d',
                display: 'flex',
                gap: '10px'
            }}>
                {timeframes.map(tf => (
                    <button
                        key={tf.value}
                        onClick={() => setActiveTimeframe(tf.value)}
                        style={{
                            background: activeTimeframe === tf.value ? 'rgba(41, 98, 255, 0.2)' : 'transparent',
                            color: activeTimeframe === tf.value ? '#2962FF' : '#8b9bb4',
                            border: '1px solid',
                            borderColor: activeTimeframe === tf.value ? '#2962FF' : '#1e222d',
                            padding: '4px 12px',
                            cursor: 'pointer',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600',
                            transition: 'all 0.2s',
                        }}
                    >
                        {tf.label}
                    </button>
                ))}
            </div>

            <div ref={chartContainerRef} style={{ position: 'relative', width: '100%', flex: 1, minHeight: 0 }}>
                <div
                    ref={legendRef}
                    style={{
                        position: 'absolute',
                        top: '12px',
                        left: '12px',
                        zIndex: 2,
                        color: '#DDD',
                        fontFamily: 'sans-serif',
                        pointerEvents: 'none',
                    }}
                />
                <div
                    id="chart-tooltip"
                    style={{
                        position: 'absolute',
                        display: 'none',
                        padding: '8px',
                        boxSizing: 'border-box',
                        fontSize: '12px',
                        textAlign: 'left',
                        zIndex: 1000,
                        pointerEvents: 'none',
                        border: '1px solid #2B2B43',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(30, 30, 30, 0.9)',
                        color: 'white',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                    }}
                ></div>
            </div>
        </div>
    );
};

export default Chart;
