/**
 * 日経225 オプション価格計算 (ブラック・ショールズ・モデル)
 * 
 * 累積正規分布関数の近似計算および
 * ブラック・ショールズ方程式に基づくコール/プットオプションの理論価格を算出し、
 * グラフ描画を行います。
 */

// --- ユーティリティ・数学関数 ---

/**
 * 累積標準正規分布関数 (CDF) の近似計算
 * (Abramowitz and Stegun 26.2.17 近似)
 * 
 * @param {number} x 入力値
 * @returns {number} 累積確率 (0〜1)
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
 * 
 * @param {number} S 現在の原資産価格 (日経225)
 * @param {number} K 行使価格
 * @param {number} T 満期までの期間 (年率, 例: 30日/365日)
 * @param {number} r 無リスク金利 (年率小数表現, 例: 1% -> 0.01)
 * @param {number} sigma ボラティリティ (年率小数表現, 例: 20% -> 0.2)
 * @returns {Object} { call: コール価格, put: プット価格 }
 */
function calculateBlackScholes(S, K, T, r, sigma) {
    // 満期までの期間がゼロまたは負の場合は特殊処理
    if (T <= 0) {
        return {
            call: Math.max(0, S - K),
            put: Math.max(0, K - S)
        };
    }

    // d1, d2の計算
    const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    // 累積正規分布 N(d)
    const Nd1 = cumulativeNormalDistribution(d1);
    const Nd2 = cumulativeNormalDistribution(d2);

    // N(-d) は 1 - N(d)
    const Nd1_minus = cumulativeNormalDistribution(-d1);
    const Nd2_minus = cumulativeNormalDistribution(-d2);

    // コール価格 C = S * N(d1) - K * e^(-rT) * N(d2)
    const callPrice = S * Nd1 - K * Math.exp(-r * T) * Nd2;

    // プット価格 P = K * e^(-rT) * N(-d2) - S * N(-d1)
    const putPrice = K * Math.exp(-r * T) * Nd2_minus - S * Nd1_minus;

    return {
        call: callPrice,
        put: putPrice
    };
}


// --- グラフ描画・UI更新処理 ---

let optionChartInstance = null;
let strikeChartInstance = null;
let trendingChartInstance = null;

/**
 * 入力値を取得して計算とグラフ更新を行うメイン関数
 */
function updateCalculationAndChart() {
    // フォームから入力値を取得
    const S_val = parseFloat(document.getElementById('S').value); // 現在値
    const K_val = parseFloat(document.getElementById('K').value); // 行使価格
    const T_days = parseFloat(document.getElementById('T_days').value); // 残存日数
    const sigma_pct = parseFloat(document.getElementById('sigma').value); // ボラティリティ (%)
    const r_pct = parseFloat(document.getElementById('r').value); // 金利 (%)

    // バリデーション補正（異常値のガード）
    if (isNaN(S_val) || S_val <= 0) return;
    if (isNaN(K_val) || K_val <= 0) return;
    const T = Math.max(0, T_days) / 365.0; // 日数を年率に変換
    const sigma = Math.max(0.0001, sigma_pct) / 100.0; // %を小数に変換 (0除算回避)
    const r = r_pct / 100.0; // %を小数に変換

    // 1. 指定された現在の状況での価格計算
    const result = calculateBlackScholes(S_val, K_val, T, r, sigma);

    // 画面に表示 (小数点以下2桁)
    document.getElementById('call-price').textContent = result.call.toFixed(2);
    document.getElementById('put-price').textContent = result.put.toFixed(2);

    // --- 期待計算 (将来のシミュレーション) ---
    const S_future = parseFloat(document.getElementById('S_future').value);
    const T_days_future = parseFloat(document.getElementById('T_future').value);

    if (!isNaN(S_future) && !isNaN(T_days_future)) {
        const T_future = Math.max(0, T_days_future) / 365.0;
        const futureResult = calculateBlackScholes(S_future, K_val, T_future, r, sigma);

        // 将来価格の表示
        document.getElementById('call-future-price').textContent = `将来: ${futureResult.call.toFixed(2)}`;
        document.getElementById('put-future-price').textContent = `将来: ${futureResult.put.toFixed(2)}`;

        // 期待損益 (将来価格 - 現在価格)
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

    // 2. グラフ用のデータ生成
    // ユーザー指定の範囲幅を取得 (デフォルト 5000)
    const range_width = parseFloat(document.getElementById('range_width').value) || 5000;
    
    // 現在値 S を中心とした ±range_width の範囲で原資産価格を変動させた配列を作成
    const rangeMin = Math.floor((S_val - range_width) / 100) * 100; 
    const rangeMax = Math.ceil((S_val + range_width) / 100) * 100;
    
    // 範囲の広さに応じてステップ幅を調整（常に約100〜150ポイント程度にする）
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

    // 3. グラフの描画・更新
    renderChart(labels, callData, putData, S_val, step);
}

/**
 * Chart.jsによるグラフ描画処理
 */
function renderChart(labels, callData, putData, currentS, step) {
    const ctx = document.getElementById('optionChart').getContext('2d');

    // 既存のチャートがあれば破棄 (再描画のため)
    if (optionChartInstance) {
        optionChartInstance.destroy();
    }

    optionChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'コールオプション価格',
                    data: callData,
                    borderColor: 'rgba(59, 130, 246, 1)', // Tailwind blue-500
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0, // 点を消して滑らかな線に
                    pointHoverRadius: 6,
                    tension: 0.3,
                    fill: false
                },
                {
                    label: 'プットオプション価格',
                    data: putData,
                    borderColor: 'rgba(239, 68, 68, 1)', // Tailwind red-500
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
            maintainAspectRatio: false, // コンテナに合わせて高さを可変に
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        title: (items) => `日経225原資産価格: ${items[0].label} 円`,
                        label: (item) => `${item.dataset.label}: ${parseFloat(item.raw).toFixed(2)} 円`
                    }
                },
                legend: {
                    position: 'top',
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: '日経225 原資産価格 (円)'
                    },
                    grid: {
                        color: (context) => {
                            // currentSに近いグリッド線を強調
                            if (context.tick && context.tick.value) {
                                // Chart.js v3+ では value はインデックスではなく実際のラベル値になる設定が必要か確認するが
                                // 簡易的に文字盤(label)値で比較
                                const labelValue = parseFloat(context.tick.label);
                                if (!isNaN(labelValue) && step && Math.abs(labelValue - currentS) <= step / 2) {
                                    return 'rgba(99, 102, 241, 0.5)'; // indigo-500
                                }
                            }
                            return 'rgba(0,0,0,0.1)';
                        },
                        lineWidth: 1
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'オプション理論価格 (円)'
                    },
                    beginAtZero: true
                }
            }
        },
        plugins: [{
            id: 'currentPriceLine',
            beforeDraw(chart) {
                // 現在値(S_val)の位置に縦線を描画するカスタムプラグイン
                if (!currentS) return;
                const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
                // X軸上で現在のS値がピクセル位置でどこに当たるか取得
                const xPos = x.getPixelForValue(currentS);

                // 描画範囲内にあれば線を描く
                if (xPos >= x.left && xPos <= x.right) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = 'rgba(79, 70, 229, 0.6)'; // indigo-600 with opacity
                    ctx.setLineDash([5, 5]); // 破線
                    ctx.moveTo(xPos, top);
                    ctx.lineTo(xPos, bottom);
                    ctx.stroke();
                    ctx.restore();

                    // 「現在値」ラベルを描画
                    ctx.save();
                    ctx.fillStyle = 'rgba(79, 70, 229, 1)';
                    ctx.font = '12px Inter, sans-serif';
                    ctx.fillText('現在値', xPos + 5, top + 15);
                    ctx.restore();
                }
            }
        }]
    });
}


// --- 機関投資家 動向データの取得と表示 ---

/**
 * スコア（-100〜+100）をゲージの針の角度に変換する
 * -100 → -90deg（左端）, 0 → 0deg（中央）, +100 → +90deg（右端）
 */
function scoreToNeedleDeg(score) {
    return (score / 100) * 90;
}

/**
 * スコアに応じたラベルのCSSクラスを返す
 */
function scoreToBadgeClass(score) {
    if (score >= 40)  return 'bg-green-100 text-green-800';
    if (score >= 10)  return 'bg-lime-100 text-lime-800';
    if (score >= -10) return 'bg-gray-100 text-gray-600';
    if (score >= -40) return 'bg-orange-100 text-orange-800';
    return 'bg-red-100 text-red-800';
}

async function fetchInstitutionalSentiment(filename = '') {
    const loadingEl = document.getElementById('sentiment-loading');
    const errorEl   = document.getElementById('sentiment-error');
    const contentEl = document.getElementById('sentiment-content');

    // ローディング状態にリセット
    if (contentEl) contentEl.classList.add('hidden');
    if (errorEl) errorEl.classList.add('hidden');
    if (loadingEl) loadingEl.classList.remove('hidden');

    // サーバーの場所を特定（現在実行中のホストを使用。GitHub Pages の場合は localhost への接続試行も行う）
    const baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? '' // 同一ホスト
        : 'http://localhost:9001'; // ローカルPC外（スマホWiFiなど）からの場合は明示的にポート指定

    const url = filename
        ? `${baseUrl}/api/sentiment?filename=${encodeURIComponent(filename)}`
        : `${baseUrl}/api/sentiment`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();

        if (data.status !== 'success') {
            throw new Error(data.message || 'Error parsing data');
        }

        // ========== ゲージの更新 ==========
        const score = data.sentiment_score ?? 0;
        const needle = document.getElementById('gauge-needle');
        if (needle) {
            const deg = scoreToNeedleDeg(score);
            needle.style.setProperty('--needle-deg', deg + 'deg');
        }

        // スコア数値 & ラベル
        const scoreDisplay = document.getElementById('sentiment-score-display');
        if (scoreDisplay) {
            scoreDisplay.textContent = (score >= 0 ? '+' : '') + score;
            scoreDisplay.className = 'text-3xl font-extrabold ' +
                (score >= 10 ? 'text-green-700' : score >= -10 ? 'text-gray-600' : 'text-red-700');
        }
        const labelDisplay = document.getElementById('sentiment-label-display');
        if (labelDisplay) {
            labelDisplay.textContent = data.sentiment_label ?? '---';
            labelDisplay.className = 'mt-1 text-sm font-semibold px-3 py-1 rounded-full inline-block ' + scoreToBadgeClass(score);
        }

        // ========== 対象銘柄と現物価格 + オートフィル ==========
        if (data.target_issue) {
            const issueEl = document.getElementById('target-issue');
            if (issueEl) issueEl.textContent = data.target_issue;
        }
        if (data.current_price) {
            const priceEl = document.getElementById('target-price');
            if (priceEl) priceEl.textContent = new Intl.NumberFormat('ja-JP').format(data.current_price);
            // 入力フォームへのオートフィル
            document.getElementById('S').value = Math.round(data.current_price);
            updateCalculationAndChart();
        }

        // ========== 数値フォーマット ==========
        const fmtVol = (val) => {
            if (val === 0) return '0';
            const formatted = new Intl.NumberFormat('ja-JP').format(Math.abs(val));
            return (val > 0 ? '+' : '-') + formatted;
        };

        // ========== 外資/国内ネット & バー ==========
        const maxNet = Math.max(Math.abs(data.foreign_net_volume), Math.abs(data.domestic_net_volume), 1);

        const foreignEl = document.getElementById('foreign-net');
        if (foreignEl) {
            foreignEl.textContent = fmtVol(data.foreign_net_volume);
            foreignEl.className = 'text-sm font-bold ' + (data.foreign_net_volume >= 0 ? 'text-green-700' : 'text-red-700');
        }
        const fBar = document.getElementById('foreign-bar');
        if (fBar) {
            const w = Math.abs(data.foreign_net_volume) / maxNet * 100;
            fBar.style.width = w + '%';
            fBar.className = 'h-1.5 rounded-full transition-all duration-700 ' + (data.foreign_net_volume >= 0 ? 'bg-green-500' : 'bg-red-500');
        }
        const domesticEl = document.getElementById('domestic-net');
        if (domesticEl) {
            domesticEl.textContent = fmtVol(data.domestic_net_volume);
            domesticEl.className = 'text-sm font-bold ' + (data.domestic_net_volume >= 0 ? 'text-green-700' : 'text-red-700');
        }
        const dBar = document.getElementById('domestic-bar');
        if (dBar) {
            const w = Math.abs(data.domestic_net_volume) / maxNet * 100;
            dBar.style.width = w + '%';
            dBar.className = 'h-1.5 rounded-full transition-all duration-700 ' + (data.domestic_net_volume >= 0 ? 'bg-green-500' : 'bg-red-500');
        }

        // ========== Buy/Sell 比率 ==========
        const ratioEl = document.getElementById('buy-sell-ratio');
        if (ratioEl && data.buy_sell_ratio != null) {
            ratioEl.textContent = data.buy_sell_ratio.toFixed(3);
            ratioEl.className = 'text-lg font-extrabold ' + (data.buy_sell_ratio >= 1 ? 'text-green-700' : 'text-red-700');
        }

        // ========== トップ買い手・売り手リスト ==========
        const renderList = (listId, items, isBuyer) => {
            const ul = document.getElementById(listId);
            if (!ul) return;
            ul.innerHTML = '';
            items.forEach(item => {
                const li = document.createElement('li');
                const sign = item.net_volume >= 0 ? '+' : '';
                const net = new Intl.NumberFormat('ja-JP').format(Math.round(item.net_volume));
                const catBadge = item.category === 'foreign'
                    ? '<span class="ml-1 text-[10px] bg-blue-100 text-blue-700 rounded px-1">外資</span>'
                    : '';
                li.innerHTML = `<span class="font-medium">${item.name}</span>${catBadge}<span class="float-right ${isBuyer ? 'text-green-600' : 'text-red-600'}">${sign}${net}</span>`;
                ul.appendChild(li);
            });
        };
        renderList('top-buyers-list',  data.top_buyers,  true);
        renderList('top-sellers-list', data.top_sellers, false);

        loadingEl.classList.add('hidden');
        contentEl.classList.remove('hidden');

        // ========== 行使価格別分布グラフの更新 ==========
        updateStrikeChart(data.strike_distribution || []);

    } catch (err) {
        console.error('Failed to fetch sentiment:', err);
        loadingEl.classList.add('hidden');
        errorEl.innerHTML = '<div class="text-indigo-800 font-bold mb-1">分析サーバーと接続できません</div>' + 
                           '<p class="text-[10px] text-gray-500">PCの電源がオフ、またはサーバーが起動していないため、価格計算機能（基本電卓）のみが利用可能です。</p>';
        errorEl.classList.remove('hidden');
    }
}

// --- ファイル一覧の取得とドロップダウン初期化 ---

/**
 * /api/files からファイル一覧を取得してセレクトボックスを構築する
 */
async function loadFileList() {
    const baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? '' : 'http://localhost:9001';
    try {
        const res = await fetch(`${baseUrl}/api/files`);
        const data = await res.json();
        sel.innerHTML = '';
        const files = data.files || [];
        if (files.length === 0) {
            sel.innerHTML = '<option value="">ファイルなし</option>';
            return;
        }
        files.forEach((f, idx) => {
            const opt = document.createElement('option');
            opt.value = f.filename;
            // 日付を YYYY/MM/DD 形式で表示
            const d = f.date;
            const label = d.length === 8
                ? `${d.slice(0,4)}/${d.slice(4,6)}/${d.slice(6,8)} - ${f.type === 'whole_day' ? '日中全体' : f.filename}`
                : f.filename;
            opt.textContent = label;
            if (idx === 0) opt.selected = true;  // 最新ファイルをデフォルト選択
            sel.appendChild(opt);
        });
    } catch (e) {
        console.error('Failed to load file list:', e);
        if (sel) sel.innerHTML = '<option value="">取得失敗</option>';
    }
}

/**
 * ドロップダウンで選択中のファイルでセンチメント分析を実行する（外部から呼び出し可）
 */
async function loadSentiment() {
    const sel = document.getElementById('file-selector');
    const selectedFile = sel ? sel.value : '';
    await fetchInstitutionalSentiment(selectedFile);
}

/**
 * 行使価格別の売買分布グラフを描画・更新する
 */
function updateStrikeChart(strikeDist) {
    const ctx = document.getElementById('strikeChart');
    if (!ctx) return;

    // 現在値に近い範囲を表示するためにフィルタリング（任意）
    const labels = strikeDist.map(d => d.strike);
    const callData = strikeDist.map(d => d.call_net);
    const putData = strikeDist.map(d => d.put_net);

    if (strikeChartInstance) {
        strikeChartInstance.data.labels = labels;
        strikeChartInstance.data.datasets[0].data = callData;
        strikeChartInstance.data.datasets[1].data = putData;
        strikeChartInstance.update();
    } else {
        strikeChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'コール ネット',
                        data: callData,
                        backgroundColor: 'rgba(54, 162, 235, 0.6)',
                        borderColor: 'rgb(54, 162, 235)',
                        borderWidth: 1
                    },
                    {
                        label: 'プット ネット',
                        data: putData,
                        backgroundColor: 'rgba(255, 99, 132, 0.6)',
                        borderColor: 'rgb(255, 99, 132)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { title: { display: true, text: '行使価格', font: { size: 10 } } },
                    y: { title: { display: true, text: '枚数', font: { size: 10 } } }
                },
                plugins: {
                    legend: { labels: { font: { size: 10 } } }
                }
            }
        });
    }
}

/**
 * 時系列トレンドグラフを取得・描画する
 */
async function fetchTrendingData() {
    const baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? '' : 'http://localhost:9001';
    try {
        const res = await fetch(`${baseUrl}/api/timeseries`);
        if (!res.ok) return;
        const data = await res.json();
        const ts = data.timeseries || [];

        const ctx = document.getElementById('trendingChart');
        if (!ctx) return;

        const labels = ts.map(d => d.date);
        const callNet = ts.map(d => d.call_net);
        const putNet = ts.map(d => d.put_net);

        if (trendingChartInstance) {
            trendingChartInstance.data.labels = labels;
            trendingChartInstance.data.datasets[0].data = callNet;
            trendingChartInstance.data.datasets[1].data = putNet;
            trendingChartInstance.update();
        } else {
            trendingChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'コール累計',
                            data: callNet,
                            borderColor: 'rgb(54, 162, 235)',
                            backgroundColor: 'rgba(54, 162, 235, 0.1)',
                            borderWidth: 2,
                            tension: 0.3,
                            fill: true,
                            pointRadius: 3
                        },
                        {
                            label: 'プット累計',
                            data: putNet,
                            borderColor: 'rgb(255, 99, 132)',
                            backgroundColor: 'rgba(255, 99, 132, 0.1)',
                            borderWidth: 2,
                            tension: 0.3,
                            fill: true,
                            pointRadius: 3
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { ticks: { font: { size: 10 } } },
                        y: { 
                            title: { display: true, text: 'ネット累計', font: { size: 10 } },
                            ticks: { font: { size: 10 } }
                        }
                    },
                    plugins: {
                        legend: { labels: { font: { size: 10 } } }
                    }
                }
            });
        }
    } catch (e) {
        console.error('Failed to fetch trending data:', e);
    }
}

// --- イベントリスナー設定 ---

document.addEventListener('DOMContentLoaded', async () => {
    // 初回ロード時にデフォルト値で計算と描画を実行
    updateCalculationAndChart();

    // ファイル一覧を取得してドロップダウンを初期化
    await loadFileList();

    // 取得後に初回の分析を実行
    await loadSentiment();

    // 時系列データの取得
    await fetchTrendingData();

    // ドロップダウン変更時に自動再読み込み
    const sel = document.getElementById('file-selector');
    if (sel) {
        sel.addEventListener('change', () => loadSentiment());
    }

    // フォーム送信時（ボタン押下時）の動作
    const form = document.getElementById('bs-form');
    form.addEventListener('submit', (e) => {
        e.preventDefault(); // 画面リロードを防ぐ
        updateCalculationAndChart();
    });

    // 入力値が変更されるたびにリアルタイム更新
    const inputs = form.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            updateCalculationAndChart();
        });
    });

    // 初期化時に建玉残高 (OI) 分布も取得する
    fetchOIDistribution();
});

// --- 建玉残高 (OI) 分布の取得と描画 ---
let oiChart = null;

async function fetchOIDistribution() {
    const loadingEl = document.getElementById('oi-loading');
    const contentEl = document.getElementById('oi-content');
    const errorEl = document.getElementById('oi-error');
    const filenameEl = document.getElementById('oi-filename');

    if (!loadingEl || !contentEl) return;

    loadingEl.innerHTML = `
        <svg class="animate-spin h-5 w-5 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        OI データをリクエスト中...`;
    loadingEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
    errorEl.classList.add('hidden');

    const baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? '' : 'http://localhost:9001';
    try {
        const response = await fetch(`${baseUrl}/api/oi_distribution`, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`サーバーエラー (HTTP ${response.status})`);
        }
        
        const result = await response.json();

        if (result.status === 'success') {
            if (filenameEl) filenameEl.textContent = result.file;
            renderOIChart(result.data);
            loadingEl.classList.add('hidden');
            contentEl.classList.remove('hidden');
        } else {
            throw new Error(result.message || '不明なエラー');
        }
    } catch (error) {
        clearTimeout(timeoutId);
        console.error('Error fetching OI data:', error);
        
        let msg = '通信エラーまたはタイムアウト';
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            msg = '現在、分析サーバー（PC）がオフの状態です。計算機能のみ利用可能です。';
        } else if (error.name === 'AbortError') {
            msg = 'リクエストがタイムアウトしました。';
        } else if (error.message) {
            msg = error.message;
        }

        if (errorEl) {
            errorEl.innerHTML = `<div class="text-indigo-800 font-bold mb-1">分析データが利用できません</div><p class="text-[10px] text-gray-500">${msg}</p>`;
            errorEl.classList.remove('hidden');
        }
        loadingEl.classList.add('hidden');
    }
}

function renderOIChart(data) {
    const canvas = document.getElementById('oiDistributionChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // 行使価格のラベルとデータを抽出
    const labels = data.map(item => item.strike);
    const callData = data.map(item => item.call_oi);
    const putData = data.map(item => item.put_oi);

    if (oiChart) {
        oiChart.destroy();
    }

    oiChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'コール建玉 (Call OI)',
                    data: callData,
                    backgroundColor: 'rgba(54, 162, 235, 0.7)',
                    borderColor: 'rgb(54, 162, 235)',
                    borderWidth: 1
                },
                {
                    label: 'プット建玉 (Put OI)',
                    data: putData,
                    backgroundColor: 'rgba(255, 99, 132, 0.7)',
                    borderColor: 'rgb(255, 99, 132)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: '行使価格 (Strike)', font: { size: 10 } },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    title: { display: true, text: '建玉残高 (枚数)', font: { size: 10 } }
                }
            },
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            }
        }
    });
}

