/**
 * 日経225 オプション価格計算 (ブラック・ショールズ・モデル) - スタンドアロン版
 */

// --- ユーティリティ・数学関数 ---

/**
 * 累積標準正規分布関数 (CDF) の近似計算
 * (Abramowitz and Stegun 26.2.17 近似)
 */
function cumulativeNormalDistribution(x) {
    const b1 = 0.319381530;
    const b2 = -0.356563782;
    const b3 = 1.781477937;
    const b4 = -1.821255978;
    const b5 = 1.330274429;
    const p = 0.2316419;
    const c = 0.39894228;

    if (x >= 0.0) {
        let t = 1.0 / (1.0 + p * x);
        return (1.0 - c * Math.exp(-x * x / 2.0) * t *
            (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1));
    } else {
        let t = 1.0 / (1.0 - p * x);
        return (c * Math.exp(-x * x / 2.0) * t *
            (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1));
    }
}

/**
 * ブラック・ショールズ・モデルによるオプション価格計算
 */
function calculateBlackScholes(S, K, T, r, sigma) {
    if (T <= 0) {
        return {
            call: Math.max(0, S - K),
            put: Math.max(0, K - S)
        };
    }
    const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    const Nd1 = cumulativeNormalDistribution(d1);
    const Nd2 = cumulativeNormalDistribution(d2);
    const Nd1_minus = cumulativeNormalDistribution(-d1);
    const Nd2_minus = cumulativeNormalDistribution(-d2);

    const callPrice = S * Nd1 - K * Math.exp(-r * T) * Nd2;
    const putPrice = K * Math.exp(-r * T) * Nd2_minus - S * Nd1_minus;

    return { call: callPrice, put: putPrice };
}

// --- グラフ描画・UI更新処理 ---

let optionChartInstance = null;

function updateCalculationAndChart() {
    const S_val = parseFloat(document.getElementById('S').value);
    const K_val = parseFloat(document.getElementById('K').value);
    const T_days = parseFloat(document.getElementById('T_days').value);
    const sigma_pct = parseFloat(document.getElementById('sigma').value);
    const r_pct = parseFloat(document.getElementById('r').value);

    if (isNaN(S_val) || S_val <= 0 || isNaN(K_val) || K_val <= 0) return;
    
    const T = Math.max(0, T_days) / 365.0;
    const sigma = Math.max(0.0001, sigma_pct) / 100.0;
    const r = r_pct / 100.0;

    const result = calculateBlackScholes(S_val, K_val, T, r, sigma);
    document.getElementById('call-price').textContent = result.call.toFixed(2);
    document.getElementById('put-price').textContent = result.put.toFixed(2);

    // 将来シミュレーション
    const S_future = parseFloat(document.getElementById('S_future').value);
    const T_days_future = parseFloat(document.getElementById('T_future').value);

    if (!isNaN(S_future) && !isNaN(T_days_future)) {
        const T_future = Math.max(0, T_days_future) / 365.0;
        const futureResult = calculateBlackScholes(S_future, K_val, T_future, r, sigma);

        document.getElementById('call-future-price').textContent = `将来: ${futureResult.call.toFixed(2)}`;
        document.getElementById('put-future-price').textContent = `将来: ${futureResult.put.toFixed(2)}`;

        const callPL = futureResult.call - result.call;
        const putPL = futureResult.put - result.put;

        const formatPL = (val, elId) => {
            const el = document.getElementById(elId);
            const prefix = val >= 0 ? '+' : '';
            el.textContent = `${prefix}${val.toFixed(2)}`;
            el.className = `text-xs font-black ${val >= 0 ? 'text-green-600' : 'text-red-600'}`;
        };
        formatPL(callPL, 'call-expected-pl');
        formatPL(putPL, 'put-expected-pl');
    }

    // グラフ用データ
    const range_width = parseFloat(document.getElementById('range_width').value) || 5000;
    const rangeMin = Math.floor((S_val - range_width) / 100) * 100; 
    const rangeMax = Math.ceil((S_val + range_width) / 100) * 100;
    const step = Math.max(10, Math.floor((rangeMax - rangeMin) / 100)); 

    const labels = [];
    const callData = [];
    const putData = [];

    for (let currentS = rangeMin; currentS <= rangeMax; currentS += step) {
        labels.push(currentS);
        const resForPlot = calculateBlackScholes(currentS, K_val, T, r, sigma);
        callData.push(resForPlot.call);
        putData.push(resForPlot.put);
    }
    renderChart(labels, callData, putData, S_val, step);
}

function renderChart(labels, callData, putData, currentS, step) {
    const ctx = document.getElementById('optionChart').getContext('2d');
    if (optionChartInstance) optionChartInstance.destroy();

    optionChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'コール価格',
                    data: callData,
                    borderColor: 'rgba(59, 130, 246, 1)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    tension: 0.3,
                    fill: false
                },
                {
                    label: 'プット価格',
                    data: putData,
                    borderColor: 'rgba(239, 68, 68, 1)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    tension: 0.3,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                tooltip: {
                    callbacks: {
                        title: (items) => `原資産価格: ${items[0].label} 円`,
                        label: (item) => `${item.dataset.label}: ${parseFloat(item.raw).toFixed(2)} 円`
                    }
                },
                legend: { position: 'top' }
            },
            scales: {
                x: {
                    title: { display: true, text: '原資産価格 (円)' },
                    grid: {
                        color: (context) => {
                            const labelValue = parseFloat(context.tick.label);
                            if (!isNaN(labelValue) && Math.abs(labelValue - currentS) <= step / 2) {
                                return 'rgba(99, 102, 241, 0.5)';
                            }
                            return 'rgba(0,0,0,0.1)';
                        }
                    }
                },
                y: { title: { display: true, text: '価格 (円)' }, beginAtZero: true }
            }
        },
        plugins: [{
            id: 'currentPriceLine',
            beforeDraw(chart) {
                if (!currentS) return;
                const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
                const xPos = x.getPixelForValue(currentS);
                if (xPos >= x.left && xPos <= x.right) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = 'rgba(79, 70, 229, 0.6)';
                    ctx.setLineDash([5, 5]);
                    ctx.moveTo(xPos, top);
                    ctx.lineTo(xPos, bottom);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }]
    });
}

document.addEventListener('DOMContentLoaded', () => {
    updateCalculationAndChart();
    const form = document.getElementById('bs-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            updateCalculationAndChart();
        });
        const inputs = form.querySelectorAll('input');
        inputs.forEach(input => {
            input.addEventListener('input', () => updateCalculationAndChart());
        });
    }
});
