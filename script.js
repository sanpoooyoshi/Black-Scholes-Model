/**
 * 日経225 オプション価格計算 (ブラック・ショールズ・モデル) - スタンドアロン版
 */

/**
 * 累積標準正規分布関数 (CDF) の近似計算
 */
function cumulativeNormalDistribution(x) {
    const b1 = 0.319381530, b2 = -0.356563782, b3 = 1.781477937;
    const b4 = -1.821255978, b5 = 1.330274429;
    const p = 0.2316419, c = 0.39894228;
    if (x >= 0.0) {
        let t = 1.0 / (1.0 + p * x);
        return 1.0 - c * Math.exp(-x * x / 2.0) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
    } else {
        let t = 1.0 / (1.0 - p * x);
        return c * Math.exp(-x * x / 2.0) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
    }
}

/**
 * ブラック・ショールズによるコール/プット価格計算
 */
function calculateBlackScholes(S, K, T, r, sigma) {
    if (T <= 0) return { call: Math.max(0, S - K), put: Math.max(0, K - S) };
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    return {
        call: S * cumulativeNormalDistribution(d1) - K * Math.exp(-r * T) * cumulativeNormalDistribution(d2),
        put:  K * Math.exp(-r * T) * cumulativeNormalDistribution(-d2) - S * cumulativeNormalDistribution(-d1)
    };
}

/**
 * スマイルカーブに基づくストライク別 IV の計算
 * @param {number} K 行使価格
 * @param {number} F 現在の原資産価格 (先物価格を代用)
 * @param {number} atmIV ATMのボラティリティ (%)
 * @param {number} skew 1次係数
 * @param {number} conv 2次係数 (Convexity)
 * @returns {number} 10進数の IV (例: 0.20)
 */
function calcSmileIV(K, F, atmIV, skew, conv) {
    const x = Math.log(K / F);
    let ivPct = atmIV + (skew * x) + (conv * x * x);
    return Math.max(0.1, ivPct) / 100.0; // 最小0.1%を保証
}

/**
 * 入力値を取得して計算と表示を更新するメイン関数
 */
function updateCalculation() {
    const S_val      = parseFloat(document.getElementById('S').value);
    const K_val      = parseFloat(document.getElementById('K').value);
    const T_days     = parseFloat(document.getElementById('T_days').value);
    const sigma_atm  = parseFloat(document.getElementById('sigma_atm').value);
    const skew       = parseFloat(document.getElementById('skew').value);
    const convexity  = parseFloat(document.getElementById('convexity').value);
    const r_pct      = parseFloat(document.getElementById('r').value);

    // 要素が存在するか / 値が不正でないか簡易チェック
    if (isNaN(S_val) || S_val <= 0 || isNaN(K_val) || K_val <= 0) return;

    const T = Math.max(0, T_days) / 365.0;
    const r = r_pct / 100.0;

    // 現在の行使価格（K_val）専用の IV を計算
    const local_sigma = calcSmileIV(K_val, S_val, sigma_atm, skew, convexity);

    // K_val に対する価格計算と表示
    const result = calculateBlackScholes(S_val, K_val, T, r, local_sigma);
    document.getElementById('call-price').textContent = result.call.toFixed(2);
    document.getElementById('put-price').textContent  = result.put.toFixed(2);

    // ストライク別テーブルの更新
    renderStrikeTable(S_val, K_val, T, r, sigma_atm, skew, convexity);
}

/**
 * ストライク別オプション価格テーブルの描画
 * K を現在値±3000、500円刻みで変動（S 固定）、降順表示。スマイルカーブのIVを適用。
 */
function renderStrikeTable(S_val, K_val, T, r, sigma_atm, skew, convexity) {
    const tbody = document.getElementById('strike-table-body');
    if (!tbody) return;

    const base = Math.round(S_val / 500) * 500; // 500円刻みに丸めた現在値
    const TABLE_RANGE = 3000, STEP = 500;

    const rows = [];
    // 行使価格（K）を高い順に変動
    for (let k = base + TABLE_RANGE; k >= base - TABLE_RANGE; k -= STEP) {
        // そのストライク専用のIVを算出してBSモデル適用
        const local_sigma = calcSmileIV(k, S_val, sigma_atm, skew, convexity);
        const p = calculateBlackScholes(S_val, k, T, r, local_sigma);
        
        // 選択された行使価格 K_val に最も近い行をハイライト
        const isSelected = Math.abs(k - K_val) < STEP / 2;
        const rowBg = isSelected
            ? 'background:#e0e7ff;font-weight:700;'
            : (k % 1000 === 0 ? 'background:#f9fafb;' : '');
        const cellBase = 'padding:10px 14px;border-top:1px solid #f0f0f0;font-size:14px;';
        
        const ivDisplay = (local_sigma * 100).toFixed(1);
        rows.push(`
            <tr style="${rowBg}">
                <td style="${cellBase}font-family:monospace;text-align:left;">${k.toLocaleString('ja-JP')}</td>
                <td style="${cellBase}text-align:right;color:#4b5563;">${ivDisplay}</td>
                <td style="${cellBase}text-align:right;color:#1d4ed8;font-weight:600;">${p.call.toFixed(2)}</td>
                <td style="${cellBase}text-align:right;color:#b91c1c;font-weight:600;">${p.put.toFixed(2)}</td>
            </tr>
        `);
    }
    tbody.innerHTML = rows.join('');
}

/**
 * Yahoo Finance API から日経225先物 (NK=F) の最新価格を取得する
 */
async function fetchNikkeiFutures() {
    const btn = document.getElementById('calc-btn');
    if (btn) { btn.textContent = '取得中...'; btn.disabled = true; }
    try {
        const url = 'https://query2.finance.yahoo.com/v8/finance/chart/NK=F?interval=1m&range=1d';
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const meta  = data?.chart?.result?.[0]?.meta;
        const price = meta?.regularMarketPrice ?? meta?.previousClose ?? null;
        return price ? Math.round(price) : null;
    } catch (e) {
        console.warn('先物価格の取得に失敗:', e.message);
        return null;
    } finally {
        if (btn) { btn.textContent = '計算実行（先物価格を自動取得）'; btn.disabled = false; }
    }
}

/**
 * 取得結果バッジの更新
 */
function setFetchBadge(text, color) {
    const badge = document.getElementById('price-badge');
    if (badge) { badge.textContent = text; badge.style.color = color; }
}

document.addEventListener('DOMContentLoaded', () => {
    updateCalculation();
    const form = document.getElementById('bs-form');
    if (form) {
        // 計算実行ボタン: 先物価格取得 → 計算
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const price = await fetchNikkeiFutures();
            if (price) {
                document.getElementById('S').value = price;
                setFetchBadge(`NK=F 取得: ${price.toLocaleString('ja-JP')} 円`, '#16a34a');
            } else {
                setFetchBadge('自動取得失敗 - 手動入力値で計算', '#dc2626');
            }
            updateCalculation();
        });
        // 入力変更時はリアルタイム計算（API 呼び出しなし）
        form.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => updateCalculation());
        });
    }
});
