/**
 * 日経225 オプション価格計算 (ブラック・ショールズ・モデル) - スタンドアロン版
 */

/**
 * 累積標準正規分布関数 (CDF) の近似計算
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
 * ブラック・ショールズによるコール/プット価格計算
 */
function calculateBlackScholes(S, K, T, r, sigma) {
    if (T <= 0) {
        return { call: Math.max(0, S - K), put: Math.max(0, K - S) };
    }
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    return {
        call: S * cumulativeNormalDistribution(d1) - K * Math.exp(-r * T) * cumulativeNormalDistribution(d2),
        put: K * Math.exp(-r * T) * cumulativeNormalDistribution(-d2) - S * cumulativeNormalDistribution(-d1)
    };
}

let optionChartInstance = null;

/**
 * 入力値を取得して計算とグラフを更新するメイン関数
 */
function updateCalculationAndChart() {
    const S_val    = parseFloat(document.getElementById('S').value);
    const K_val    = parseFloat(document.getElementById('K').value);
    const T_days   = parseFloat(document.getElementById('T_days').value);
    const sigma_pct = parseFloat(document.getElementById('sigma').value);
    const r_pct    = parseFloat(document.getElementById('r').value);

    if (isNaN(S_val) || S_val <= 0 || isNaN(K_val) || K_val <= 0) return;

    const T     = Math.max(0, T_days) / 365.0;
    const sigma = Math.max(0.0001, sigma_pct) / 100.0;
    const r     = r_pct / 100.0;

    // 現在価格の計算と表示
    const result = calculateBlackScholes(S_val, K_val, T, r, sigma);
    document.getElementById('call-price').textContent = result.call.toFixed(2);
    document.getElementById('put-price').textContent  = result.put.toFixed(2);

    // 行使価格テーブルの更新（現在値 ±3000、500円刻み）
    renderStrikeTable(S_val, K_val, T, r, sigma);

    // グラフ用データ生成
    const range_width = parseFloat(document.getElementById('range_width').value) || 3000;
    const rangeMin = Math.floor((S_val - range_width) / 100) * 100;
    const rangeMax = Math.ceil((S_val + range_width) / 100) * 100;
    const step     = Math.max(10, Math.floor((rangeMax - rangeMin) / 100));

    const labels = [], callData = [], putData = [];
    for (let s = rangeMin; s <= rangeMax; s += step) {
        labels.push(s);
        const p = calculateBlackScholes(s, K_val, T, r, sigma);
        callData.push(p.call);
        putData.push(p.put);
    }

    renderChart(labels, callData, putData, S_val, step);
}

/**
 * 行使価格別オプション価格テーブルの描画
 * 現在値 ±3000 の範囲を 500 円刻みで表示する
 */
function renderStrikeTable(S_val, K_val, T, r, sigma) {
    const tbody = document.getElementById('strike-table-body');
    if (!tbody) return;

    // 500円刻みに丸めた現在値を基準にする
    const base = Math.round(S_val / 500) * 500;
    const TABLE_RANGE = 3000;
    const STEP = 500;

    const rows = [];
    for (let k = base - TABLE_RANGE; k <= base + TABLE_RANGE; k += STEP) {
        const p = calculateBlackScholes(S_val, k, T, r, sigma);
        // 選択中の行使価格に最も近い行をハイライト
        const isSelected = Math.abs(k - K_val) < STEP / 2;
        const rowBg = isSelected
            ? 'background:#e0e7ff;font-weight:700;'
            : (k % 1000 === 0 ? 'background:#f9fafb;' : '');
        const cellBase = 'padding:10px 14px;border-top:1px solid #f0f0f0;font-size:14px;';
        rows.push(`
            <tr style="${rowBg}">
                <td style="${cellBase}font-family:monospace;text-align:left;">${k.toLocaleString('ja-JP')}</td>
                <td style="${cellBase}text-align:right;color:#1d4ed8;font-weight:600;">${p.call.toFixed(2)}</td>
                <td style="${cellBase}text-align:right;color:#b91c1c;font-weight:600;">${p.put.toFixed(2)}</td>
            </tr>
        `);
    }
    tbody.innerHTML = rows.join('');
}

/**
 * Chart.js によるグラフ描画
 */
function renderChart(labels, callData, putData, currentS, step) {
    const ctx = document.getElementById('optionChart').getContext('2d');
    if (optionChartInstance) optionChartInstance.destroy();

    optionChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'コール',
                    data: callData,
                    borderColor: 'rgba(59, 130, 246, 1)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    tension: 0.3,
                    fill: false
                },
                {
                    label: 'プット',
                    data: putData,
                    borderColor: 'rgba(239, 68, 68, 1)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 5,
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
                        title: (items) => `原資産: ${items[0].label} 円`,
                        label: (item) => `${item.dataset.label}: ${parseFloat(item.raw).toFixed(2)} 円`
                    }
                },
                legend: { position: 'top' }
            },
            scales: {
                x: {
                    title: { display: true, text: '原資産価格 (円)' },
                    grid: {
                        color: (ctx) => {
                            const v = parseFloat(ctx.tick.label);
                            return !isNaN(v) && Math.abs(v - currentS) <= step / 2
                                ? 'rgba(99, 102, 241, 0.5)'
                                : 'rgba(0,0,0,0.1)';
                        }
                    }
                },
                y: { title: { display: true, text: '価格 (円)' }, beginAtZero: true, max: 1000 }
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
        form.addEventListener('submit', (e) => { e.preventDefault(); updateCalculationAndChart(); });
        form.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => updateCalculationAndChart());
        });
    }
});
