// Application state
let chart;
let cycleDetector;
let cycleMomentum;
let currentSymbol = 'SUIUSDT';
let currentTimeframe = '1m';
let isLoading = false;
let currentManualCycle = null; // {startIndex, endIndex}

// Timeframe mapping for Binance API
const timeframeMap = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d'
};

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('chart-canvas');
    chart = new CandlestickChart(canvas);
    cycleDetector = new CycleDetector();
    cycleMomentum = new CycleSwingMomentum();

    setupEventListeners();
    loadChartData();
});

function setupEventListeners() {
    // Cryptocurrency selector
    const cryptoSelect = document.getElementById('crypto-select');
    cryptoSelect.addEventListener('change', (e) => {
        currentSymbol = e.target.value;
        loadChartData();
    });

    // Timeframe buttons
    const tfButtons = document.querySelectorAll('.tf-btn');
    tfButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tfButtons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentTimeframe = e.target.dataset.timeframe;
            loadChartData();
        });
    });

    // Reset button
    document.getElementById('reset-btn').addEventListener('click', () => {
        chart.reset();
    });

    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', () => {
        loadChartData();
    });

    // Cycle Indicator Controls
    const updateConfig = () => {
        chart.updateConfig({
            showLabels: document.getElementById('show-labels').checked,
            showParabola: document.getElementById('show-parabola').checked,
            showMin: document.getElementById('show-min').checked,
            showProjections: document.getElementById('show-projections').checked
        });
    };

    // Initialize Config
    updateConfig();

    document.getElementById('show-labels').addEventListener('change', updateConfig);
    document.getElementById('show-parabola').addEventListener('change', updateConfig);
    document.getElementById('show-min').addEventListener('change', updateConfig);

    // Momentum Rule Toggle
    document.getElementById('use-momentum-rule').addEventListener('change', () => {
        loadChartData(); // Re-run detection
    });



    // Stats Window removed - no longer using makeDraggable

    // Projections Toggle
    // Projections Toggle
    document.getElementById('show-projections').addEventListener('change', updateConfig);

    // Inverse Cycles Toggle

    document.getElementById('show-index-cycles').addEventListener('change', () => {
        loadChartData();
    });
    document.getElementById('show-inverse-cycles').addEventListener('change', () => {
        loadChartData();
    });

    // Priority 24 Bars Toggle
    document.getElementById('priority-24-bars').addEventListener('change', () => {
        loadChartData();
    });

    // Custom Cycle Range - always use the visible inputs
    document.getElementById('custom-min').addEventListener('change', () => loadChartData());
    document.getElementById('custom-max').addEventListener('change', () => loadChartData());

    // Momentum Parameters
    const momInputs = ['mom-cycs', 'mom-lbl', 'mom-lbr', 'mom-min', 'mom-max'];
    momInputs.forEach(id => {
        document.getElementById(id).addEventListener('change', () => loadChartData());
    });

    // Manual Cycle Controls
    const manualBtn = document.getElementById('manual-mode-btn');
    const clearManualBtn = document.getElementById('clear-manual-btn');

    manualBtn.addEventListener('click', () => {
        chart.manualMode = true;
        chart.manualPoints = [];
        chart.canvas.style.cursor = 'crosshair';
        // Visual feedback?
        manualBtn.textContent = 'Click Start & End...';
        setTimeout(() => manualBtn.textContent = 'Set Manual', 2000);
    });

    clearManualBtn.addEventListener('click', () => {
        currentManualCycle = null;
        chart.manualPoints = [];
        loadChartData();
    });

    // Chart Callback
    chart.onManualCycleComplete = (startPoint, endPoint) => {
        currentManualCycle = {
            startIndex: startPoint.index,
            endIndex: endPoint.index
        };
        console.log('Manual Cycle Set:', currentManualCycle);
        loadChartData();
    };
}

function makeDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const header = document.getElementById(element.id + "header") || element.querySelector('.window-header');

    if (header) {
        // if present, the header is where you move the DIV from:
        header.onmousedown = dragMouseDown;
    } else {
        // otherwise, move the DIV from anywhere inside the DIV:
        element.onmousedown = dragMouseDown;
    }

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        // get the mouse cursor position at startup:
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        // call a function whenever the cursor moves:
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        // calculate the new cursor position:
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        // set the element's new position:
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        // stop moving when mouse button is released:
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

let ws = null;

async function loadChartData() {
    if (isLoading) return;

    isLoading = true;
    showLoading();

    try {
        const interval = timeframeMap[currentTimeframe];
        const limit = 1500; // Increased history for backtesting

        // Binance API endpoint
        const url = `https://api.binance.com/api/v3/klines?symbol=${currentSymbol}&interval=${interval}&limit=${limit}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch data: ${response.statusText}`);
        }

        const data = await response.json();

        // Transform Binance data to our format
        // Binance kline format: [openTime, open, high, low, close, volume, closeTime, ...]
        const candlesticks = data.map(candle => ({
            time: candle[0], // Open time
            open: parseFloat(candle[1]),
            high: parseFloat(candle[2]),
            low: parseFloat(candle[3]),
            close: parseFloat(candle[4]),
            volume: parseFloat(candle[5])
        }));

        chart.setData(candlesticks);

        // Initial Calculation
        recalculateIndicatorsAndCycles(candlesticks);

        hideLoading();

        // Start WebSocket for live updates
        startWebSocket(currentSymbol, interval);

    } catch (error) {
        console.error('Error loading chart data:', error);
        hideLoading();
        showError(`Failed to load chart data: ${error.message}`);
    } finally {
        isLoading = false;
    }
}

function recalculateIndicatorsAndCycles(candlesticks) {
    // Calculate Momentum
    const closes = candlesticks.map(c => c.close);
    const highs = candlesticks.map(c => c.high);
    const lows = candlesticks.map(c => c.low);

    // Update Momentum Parameters
    cycleMomentum.cycs = parseInt(document.getElementById('mom-cycs').value) || 50;
    cycleMomentum.lbL = parseInt(document.getElementById('mom-lbl').value) || 5;
    cycleMomentum.lbR = parseInt(document.getElementById('mom-lbr').value) || 5;
    cycleMomentum.rangeLower = parseInt(document.getElementById('mom-min').value) || 5;
    cycleMomentum.rangeUpper = parseInt(document.getElementById('mom-max').value) || 60;

    const momentumValues = cycleMomentum.calculate(closes);
    chart.setMomentum(momentumValues);

    // Detect Divergences
    const divergences = cycleMomentum.detectDivergences(momentumValues, highs, lows);
    chart.setDivergences(divergences);

    // Detect Cycles
    const useMomentum = document.getElementById('use-momentum-rule').checked;

    const showIndexCycles = document.getElementById('show-index-cycles').checked;
    const showInverseCycles = document.getElementById('show-inverse-cycles').checked;

    // Always use custom min/max values from visible inputs
    const minDuration = parseInt(document.getElementById('custom-min').value) || 24;
    const maxDuration = parseInt(document.getElementById('custom-max').value) || 44;

    const priorityMinDuration = document.getElementById('priority-24-bars').checked;

    let cycles = [];

    // Always detect inverted cycles for Target Line calculation (background)
    // If showInverseCycles is true, we might use a version with manualCycle applied, but for target line stats we usually want the auto-detected ones or consistent ones?
    // Let's calculate the pure auto one for target line if needed, or consistent with display.
    // The target line logic uses `invertedCyclesForTarget`. 
    // We calculate it here.
    const invertedCyclesForTarget = cycleDetector.detectCycles(candlesticks, useMomentum, momentumValues, true /* invert */, minDuration, maxDuration, priorityMinDuration);

    // 1. Index Cycles (User Def: Low-High-Low => Code: Inverted)
    if (showIndexCycles) {
        // Optimization: reuse the one calculated for target line if possible, or detect fresh
        // Index is now Inverted logic (Low-High-Low)
        const cyclesToIndex = cycleDetector.detectCycles(candlesticks, useMomentum, momentumValues, true /* invert */, minDuration, maxDuration, priorityMinDuration, currentManualCycle);
        cycles = cycles.concat(cyclesToIndex);
    }

    // 2. Inverse Cycles (User Def: High-Low-High => Code: Normal)
    if (showInverseCycles) {
        // Inverse is now Normal logic (High-Low-High)
        // Note: manual cycle usually applied to Index logic, but if user sets manual, we apply it to whatever is active. 
        // We passed currentManualCycle to Index above. Should we pass to Inverse too?
        // Let's pass it to both if active, or rely on internal logic. 
        // For distinct visualization, usually manual is one or the other.
        // Assuming user uses manual primarily for the main cycle (Index).
        // But if they are viewing Inverse... let's stick to Index having priority or both.
        // I will pass it to Inverse too just in case they are focusing on that.
        const cyclesToInverse = cycleDetector.detectCycles(candlesticks, useMomentum, momentumValues, false /* invert */, minDuration, maxDuration, priorityMinDuration, currentManualCycle);
        cycles = cycles.concat(cyclesToInverse);
    }

    // Sort to keep drawing order consistent (by start index)
    cycles.sort((a, b) => a.startIndex - b.startIndex);

    chart.setCycles(cycles);

    // Set Range End Line for the last active cycle
    // The line shows where the max duration ends for the most recent cycle
    if (cycles.length > 0) {
        const lastCycle = cycles[cycles.length - 1];
        const currentBarIndex = candlesticks.length - 1;
        const cycleEndAtMax = lastCycle.startIndex + maxDuration;

        // Show line if cycle is still within range (not yet at max)
        // Line disappears when current bar reaches max duration
        if (currentBarIndex < cycleEndAtMax) {
            chart.setRangeEndLine(lastCycle.startIndex, maxDuration);
        } else {
            chart.setRangeEndLine(null, null);
        }
    } else {
        chart.setRangeEndLine(null, null);
    }

    updateStatistics(cycles, invertedCyclesForTarget);
}

function startWebSocket(symbol, interval) {
    if (ws) {
        ws.close();
    }

    const wsUrl = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`;
    ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.e === 'kline') {
            const k = message.k;
            const candle = {
                time: k.t,
                open: parseFloat(k.o),
                high: parseFloat(k.h),
                low: parseFloat(k.l),
                close: parseFloat(k.c),
                volume: parseFloat(k.v)
            };

            updateChartData(candle, k.x);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function updateChartData(newCandle, isClosed) {
    const currentData = chart.data;
    if (currentData.length === 0) return;

    const lastCandle = currentData[currentData.length - 1];

    if (newCandle.time === lastCandle.time) {
        // Update existing candle
        currentData[currentData.length - 1] = newCandle;
    } else {
        // New candle started
        currentData.push(newCandle);
        // Keep limit to avoid memory issues (optional, but good practice)
        if (currentData.length > 1000) {
            currentData.shift();
        }
    }

    // Update Chart Data (this triggers a redraw of candles)
    chart.setData(currentData);

    // Recalculate everything
    recalculateIndicatorsAndCycles(currentData);
}

function updateStatistics(cycles, invertedCyclesForTarget = null) {
    // Separate cycles by type
    const indexCycles = cycles.filter(c => c.type === 'inverted'); // Inverted in code = Index (L-H-L)
    const inverseCycles = cycles.filter(c => c.type !== 'inverted'); // Normal in code = Inverse (H-L-H)
    const candles = chart.data;

    // Helper to calculate comprehensive stats for a cycle set
    const calcCycleStats = (cycleSet, prefix) => {
        const countEl = document.getElementById(`${prefix}-count`);
        const avgDurEl = document.getElementById(`${prefix}-avg-dur`);
        const maxPriceEl = document.getElementById(`${prefix}-max-price`);
        const stdEl = document.getElementById(`${prefix}-std`);
        const volPreEl = document.getElementById(`${prefix}-vol-pre`);
        const volPostEl = document.getElementById(`${prefix}-vol-post`);
        const trendCanvas = document.getElementById(`${prefix}-trend-chart`);
        const distCanvas = document.getElementById(`${prefix}-dist-chart`);

        if (!cycleSet || cycleSet.length === 0) {
            countEl.textContent = '0';
            avgDurEl.textContent = '-';
            maxPriceEl.textContent = '-';
            stdEl.textContent = '-';
            volPreEl.textContent = '-';
            volPostEl.textContent = '-';
            clearCanvas(trendCanvas);
            clearCanvas(distCanvas);
            return null;
        }

        // Basic stats
        const durations = cycleSet.map(c => c.duration);
        const avgDuration = durations.reduce((a, b) => a + b, 0) / cycleSet.length;
        const variance = durations.reduce((a, b) => a + Math.pow(b - avgDuration, 2), 0) / cycleSet.length;
        const stdDev = Math.sqrt(variance);

        // Max price variation within cycle
        const priceVariations = cycleSet.map(c => {
            if (c.type === 'inverted') {
                // Index (L-H-L): max variation from low to high
                return ((c.maxPrice - c.startPrice) / c.startPrice) * 100;
            } else {
                // Inverse (H-L-H): max variation from high to low
                return ((c.startPrice - c.minPrice) / c.startPrice) * 100;
            }
        });
        const maxPriceVar = Math.max(...priceVariations);

        // Volume Delta (3 bars vs 10 bars before/after cycle close)
        let totalVolPre = 0, totalVolPost = 0, volCount = 0;
        cycleSet.slice(-10).forEach(cycle => {
            const closeIndex = cycle.endIndex;
            if (closeIndex < 13 || closeIndex > candles.length - 4) return;

            // 3 bars before close vs 10 bars before those
            let vol3Pre = 0, vol10Pre = 0;
            for (let i = 1; i <= 3; i++) vol3Pre += candles[closeIndex - i]?.volume || 0;
            vol3Pre /= 3;
            for (let i = 4; i <= 13; i++) vol10Pre += candles[closeIndex - i]?.volume || 0;
            vol10Pre /= 10;

            if (vol10Pre > 0) {
                totalVolPre += ((vol3Pre - vol10Pre) / vol10Pre) * 100;
            }

            // 3 bars after close vs baseline (use same 10 bars before for comparison)
            let vol3Post = 0;
            for (let i = 1; i <= 3; i++) vol3Post += candles[closeIndex + i]?.volume || 0;
            vol3Post /= 3;
            if (vol10Pre > 0) {
                totalVolPost += ((vol3Post - vol10Pre) / vol10Pre) * 100;
            }

            volCount++;
        });

        const avgVolPre = volCount > 0 ? totalVolPre / volCount : 0;
        const avgVolPost = volCount > 0 ? totalVolPost / volCount : 0;

        // Update DOM
        countEl.textContent = cycleSet.length;
        avgDurEl.textContent = avgDuration.toFixed(1) + ' bars';
        maxPriceEl.textContent = maxPriceVar.toFixed(2) + '%';
        stdEl.textContent = stdDev.toFixed(1);
        volPreEl.textContent = (avgVolPre >= 0 ? '+' : '') + avgVolPre.toFixed(1) + '%';
        volPreEl.style.color = avgVolPre >= 0 ? '#10b981' : '#ef4444';
        volPostEl.textContent = (avgVolPost >= 0 ? '+' : '') + avgVolPost.toFixed(1) + '%';
        volPostEl.style.color = avgVolPost >= 0 ? '#10b981' : '#ef4444';

        // Draw charts
        drawTrendChart(trendCanvas, durations);
        drawDistributionChart(distCanvas, durations);

        return { avgDuration, stdDev };
    };

    // Calculate stats for both cycle types
    calcCycleStats(indexCycles, 'idx');
    calcCycleStats(inverseCycles, 'inv');

    // Calculate avgDrop for target line calculation
    let avgDrop = 0;
    if (cycles.length > 0) {
        const drops = cycles.map(c => {
            if (c.type === 'inverted') {
                return ((c.maxPrice - c.endPrice) / c.maxPrice) * 100;
            } else {
                return ((c.startPrice - c.minPrice) / c.startPrice) * 100;
            }
        });
        avgDrop = drops.reduce((a, b) => a + b, 0) / cycles.length;
    }

    // Target line logic
    if (invertedCyclesForTarget && invertedCyclesForTarget.length > 0) {
        const lastInvertedCycle = invertedCyclesForTarget[invertedCyclesForTarget.length - 1];
        const candlesticks = chart.data;
        const isCycleClosed = lastInvertedCycle.endIndex < candlesticks.length - 1;

        if (isCycleClosed) {
            const targetPrice = lastInvertedCycle.endPrice - (lastInvertedCycle.endPrice * avgDrop / 100);
            chart.setTargetLine(targetPrice, avgDrop);
        } else {
            chart.setTargetLine(null);
        }
    } else {
        chart.setTargetLine(null);
    }
}

function clearCanvas(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawTrendChart(canvas, durations) {
    if (!canvas || durations.length < 5) {
        clearCanvas(canvas);
        return;
    }

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Calculate rolling 5 average
    const rollingData = [];
    for (let i = 4; i < durations.length; i++) {
        const window = durations.slice(i - 4, i + 1);
        const avg = window.reduce((a, b) => a + b, 0) / 5;
        rollingData.push(avg);
    }

    if (rollingData.length < 2) {
        clearCanvas(canvas);
        return;
    }

    const min = Math.min(...rollingData) * 0.9;
    const max = Math.max(...rollingData) * 1.1;
    const range = max - min || 1;

    // Padding: left for scale, others for margin
    const leftPadding = 35;
    const padding = 8;
    const plotWidth = width - leftPadding - padding;
    const plotHeight = height - padding * 2;
    const xStep = plotWidth / (rollingData.length - 1);

    // Draw vertical scale
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const scaleSteps = 4;
    for (let i = 0; i <= scaleSteps; i++) {
        const val = min + (range * i / scaleSteps);
        const y = padding + plotHeight - (i / scaleSteps) * plotHeight;
        ctx.fillText(Math.round(val).toString(), leftPadding - 5, y);

        // Draw horizontal grid line
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(leftPadding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }

    // Draw rolling average line
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2;
    ctx.beginPath();

    rollingData.forEach((d, i) => {
        const x = leftPadding + i * xStep;
        const y = padding + plotHeight - ((d - min) / range) * plotHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });

    ctx.stroke();

    // Add "Rolling 5" label
    ctx.fillStyle = '#6366f1';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Rolling 5', leftPadding + 2, padding + 8);
}

function drawDistributionChart(canvas, durations) {
    if (!canvas || durations.length < 3) {
        clearCanvas(canvas);
        return;
    }

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Create histogram bins
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    const range = max - min || 1;
    const binCount = Math.min(10, durations.length);
    const binWidth = range / binCount;

    const bins = new Array(binCount).fill(0);
    durations.forEach(d => {
        const binIndex = Math.min(binCount - 1, Math.floor((d - min) / binWidth));
        bins[binIndex]++;
    });

    const maxBin = Math.max(...bins);
    const padding = 5;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;
    const barWidth = plotWidth / binCount;

    // Draw bars
    ctx.fillStyle = 'rgba(139, 92, 246, 0.6)';
    bins.forEach((count, i) => {
        const barHeight = (count / maxBin) * plotHeight;
        const x = padding + i * barWidth;
        const y = padding + plotHeight - barHeight;
        ctx.fillRect(x, y, barWidth - 1, barHeight);
    });

    // Draw gaussian curve overlay
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    const variance = durations.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / durations.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev > 0) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1;
        ctx.beginPath();

        for (let x = 0; x < plotWidth; x++) {
            const val = min + (x / plotWidth) * range;
            const gaussian = Math.exp(-Math.pow(val - mean, 2) / (2 * stdDev * stdDev));
            const y = padding + plotHeight - gaussian * plotHeight;
            if (x === 0) ctx.moveTo(padding + x, y);
            else ctx.lineTo(padding + x, y);
        }

        ctx.stroke();
    }
}

function calculateRollingMedian(cycles, windowSize) {
    if (cycles.length < windowSize) return [];

    const medians = [];
    const durations = cycles.map(c => c.duration);

    for (let i = windowSize - 1; i < durations.length; i++) {
        const window = durations.slice(i - windowSize + 1, i + 1);
        // Sort to find median
        window.sort((a, b) => a - b);
        const mid = Math.floor(window.length / 2);
        const median = window.length % 2 !== 0 ? window[mid] : (window[mid - 1] + window[mid]) / 2;
        medians.push(median);
    }
    return medians;
}

function drawStatsChart(data) {
    const canvas = document.getElementById('stats-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (data.length === 0) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '12px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('Not enough data (need 10+ cycles)', width / 2, height / 2);
        return;
    }

    // Scale
    const minVal = Math.min(...data) * 0.9;
    const maxVal = Math.max(...data) * 1.1;
    const range = maxVal - minVal || 1;

    const padding = 10;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;

    const xStep = plotWidth / (data.length - 1 || 1);

    // Draw Line
    ctx.beginPath();
    ctx.strokeStyle = '#6366f1'; // Accent color
    ctx.lineWidth = 2;

    data.forEach((val, i) => {
        const x = padding + i * xStep;
        const y = height - padding - ((val - minVal) / range) * plotHeight;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });

    ctx.stroke();

    // Draw Points
    ctx.fillStyle = '#8b5cf6';
    data.forEach((val, i) => {
        const x = padding + i * xStep;
        const y = height - padding - ((val - minVal) / range) * plotHeight;

        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
    });
}

function showLoading() {
    const loading = document.getElementById('loading');
    loading.classList.remove('hidden');
}

function hideLoading() {
    const loading = document.getElementById('loading');
    loading.classList.add('hidden');
}

function showError(message) {
    // Create error notification
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        z-index: 1000;
        animation: slideInRight 0.3s ease-out;
        font-family: Inter, sans-serif;
        max-width: 400px;
    `;
    errorDiv.textContent = message;

    document.body.appendChild(errorDiv);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        errorDiv.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => errorDiv.remove(), 300);
    }, 5000);
}

// Add animation keyframes
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
