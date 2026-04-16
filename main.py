from fastapi import FastAPI, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import json
import os
import glob
import urllib.request
import ssl
import re

# 基本ディレクトリ
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# 機関投資家データフォルダのパス（相対パス）
DATA_DIR = os.path.join(BASE_DIR, "機関投資家")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静的ファイルの配信設定 (srcディレクトリを /src パスにマウント)
app.mount("/src", StaticFiles(directory="src"), name="src")

# 外資系証券会社のキーワードリスト（部分一致）
FOREIGN_KEYWORDS = [
    'Goldman', 'Morgan', 'Barclays', 'UBS', 'Citigroup', 'CS', 'BofA',
    'Societe Generale', 'BNP', 'ＪＰモルガン', 'モルガン', 'ゴールドマン',
    'バークレイズ', 'ＵＢＳ', 'シティ', 'クレディ', 'ソシエテ', 'ABN', 'ＢｏＦＡ',
    'Deutsche', 'ドイツ', 'Macquarie', 'マッコーリー', 'HSBC', 'ＨＳＢＣＦｒａ',
]

def classify_participant(name: str) -> str:
    """参加者名から外資系/国内系を判定する"""
    return 'foreign' if any(kw in name for kw in FOREIGN_KEYWORDS) else 'domestic'

def compute_sentiment_score(foreign_net: float, buy_sell_ratio: float, top5_net: float) -> int:
    """
    3つのシグナルを組み合わせて -100〜+100 のセンチメントスコアを算出する。
    1. 外資系ネット（±50点満点）
    2. Buy/Sell比率（±30点満点, 1.0を中立として）
    3. 上位5社合計ネット（±20点満点）
    """
    # --- シグナル1: 外資ネット（50点満点）---
    # 一定のスケール（例：外資ネット10万枚 = 満点）でclamp
    scale_foreign = 100000
    score_foreign = max(-50, min(50, (foreign_net / scale_foreign) * 50))

    # --- シグナル2: Buy/Sell比率（30点満点）---
    # buy_sell_ratio = 1.0 → 0点, 1.2 → +30点, 0.8 → -30点
    ratio_deviation = buy_sell_ratio - 1.0
    score_ratio = max(-30, min(30, ratio_deviation * 150))

    # --- シグナル3: 上位5社ネット（20点満点）---
    scale_top5 = 50000
    score_top5 = max(-20, min(20, (top5_net / scale_top5) * 20))

    raw_score = score_foreign + score_ratio + score_top5
    return int(round(raw_score))

def score_to_label(score: int) -> str:
    """スコアを5段階ラベルに変換する"""
    if score >= 40:
        return "強い上昇推測 ↑↑"
    elif score >= 10:
        return "上昇推測 ↑"
    elif score >= -10:
        return "中立 →"
    elif score >= -40:
        return "下落推測 ↓"
    else:
        return "強い下落推測 ↓↓"

def analyze_jpx_data(file_path: str) -> dict:
    """JPX Excelファイルを読み込み、機関投資家の売買動向を分析する"""
    if not os.path.exists(file_path):
        return {"status": "error", "message": "Data file not found."}

    df = pd.read_excel(file_path, header=4)
    df.columns = [
        'ProductClass', 'ContractMonth', 'Code', 'Issues',
        'SellVolume', 'SellParticipant', 'BuyVolume', 'BuyParticipant'
    ]
    df = df.dropna(subset=['Code'])

    # NK225F（日経225先物）に絞り込む
    nk225 = df[df['ProductClass'] == 'NK225F']

    # 数値型に変換
    sell_volumes = pd.to_numeric(nk225['SellVolume'], errors='coerce').fillna(0)
    buy_volumes = pd.to_numeric(nk225['BuyVolume'], errors='coerce').fillna(0)

    # 最多取引銘柄（限月）の特定
    nk225_v = nk225.copy()
    nk225_v['TotalVol'] = sell_volumes + buy_volumes
    issue_volumes = nk225_v.groupby('Issues')['TotalVol'].sum()
    target_issue = issue_volumes.idxmax() if not issue_volumes.empty else "Unknown Issue"
    if pd.isna(target_issue):
        target_issue = "Unknown Issue"

    # 参加者別の売買集計
    sell_data = nk225[['SellParticipant']].copy()
    sell_data['Volume'] = sell_volumes
    sell_data = sell_data.dropna(subset=['SellParticipant'])

    buy_data = nk225[['BuyParticipant']].copy()
    buy_data['Volume'] = buy_volumes
    buy_data = buy_data.dropna(subset=['BuyParticipant'])

    sell_agg = sell_data.groupby('SellParticipant')['Volume'].sum()
    buy_agg = buy_data.groupby('BuyParticipant')['Volume'].sum()

    participants = set(sell_agg.index).union(set(buy_agg.index))

    # 参加者ごとの明細を作成
    summary = []
    for p in participants:
        if pd.isna(p):
            continue
        p_str = str(p).strip()
        # 集計行や数字のみの行をスキップ
        if p_str in ('計', 'nan', '') or p_str.isdigit():
            continue
        sell = float(sell_agg.get(p, 0))
        buy = float(buy_agg.get(p, 0))
        net_volume = buy - sell
        category = classify_participant(p_str)
        summary.append({
            'name': p_str,
            'buy_volume': buy,
            'sell_volume': sell,
            'net_volume': net_volume,
            'category': category,
        })

    summary_df = pd.DataFrame(summary)
    if len(summary_df) == 0:
        return {"status": "error", "message": "No valid data found."}

    # --- シグナル1: 外資系ネット ---
    foreign_net = float(summary_df[summary_df['category'] == 'foreign']['net_volume'].sum())
    domestic_net = float(summary_df[summary_df['category'] == 'domestic']['net_volume'].sum())

    # --- シグナル2: 全体のBuy/Sell比率 ---
    total_buy = float(summary_df['buy_volume'].sum())
    total_sell = float(summary_df['sell_volume'].sum())
    buy_sell_ratio = (total_buy / total_sell) if total_sell > 0 else 1.0

    # トップ5買い手と売り手のネットを合算（上位ブローカーシグナル）
    top5_net = float(summary_df.sort_values('net_volume', ascending=False).head(5)['net_volume'].sum())

    # --- 総合スコア計算 ---
    score = compute_sentiment_score(foreign_net, buy_sell_ratio, top5_net)
    label = score_to_label(score)

    # Top buyers/sellers（ソートしてnet volume順に）
    top_buyers = summary_df.sort_values(by='net_volume', ascending=False).head(5).to_dict(orient='records')
    top_sellers = summary_df.sort_values(by='net_volume', ascending=True).head(5).to_dict(orient='records')

    # --- オプション（NK225E）の行使価格別分析を追加 ---
    nk225e = df[df['ProductClass'] == 'NK225E'].copy()
    strike_dist = []
    if not nk225e.empty:
        nk225e['SellVol'] = pd.to_numeric(nk225e['SellVolume'], errors='coerce').fillna(0)
        nk225e['BuyVol']  = pd.to_numeric(nk225e['BuyVolume'],  errors='coerce').fillna(0)
        
        # 行使価格の抽出 (例: P2604-53000 -> 53000)
        def extract_strike_type(code):
            m = re.search(r'OOP\s+([CP])\d+-(\d+)', str(code))
            if m:
                return m.group(1), int(m.group(2))
            return None, None
            
        nk225e['Result'] = nk225e['Code'].apply(extract_strike_type)
        nk225e['Type']   = nk225e['Result'].apply(lambda x: x[0])
        nk225e['Strike'] = nk225e['Result'].apply(lambda x: x[1])
        
        # 行使価格・種別ごとに集計
        opt_agg = nk225e.dropna(subset=['Type', 'Strike'])
        if not opt_agg.empty:
            strike_summary = opt_agg.groupby(['Strike', 'Type']).apply(
                lambda x: x['BuyVol'].sum() - x['SellVol'].sum()
            ).reset_index(name='net_volume')
            
            # グラフ用に整形
            for s in sorted(strike_summary['Strike'].unique()):
                row = {'strike': int(s), 'call_net': 0, 'put_net': 0}
                c_val = strike_summary[(strike_summary['Strike']==s) & (strike_summary['Type']=='C')]['net_volume']
                p_val = strike_summary[(strike_summary['Strike']==s) & (strike_summary['Type']=='P')]['net_volume']
                if not c_val.empty: row['call_net'] = float(c_val.iloc[0])
                if not p_val.empty: row['put_net'] = float(p_val.iloc[0])
                strike_dist.append(row)

    return {
        "status": "success",
        "sentiment_score": score,
        "sentiment_label": label,
        "foreign_net_volume": foreign_net,
        "domestic_net_volume": domestic_net,
        "buy_sell_ratio": round(buy_sell_ratio, 4),
        "total_buy_volume": total_buy,
        "total_sell_volume": total_sell,
        "top_buyers": top_buyers,
        "top_sellers": top_sellers,
        "target_issue": target_issue.strip() if isinstance(target_issue, str) else str(target_issue),
        "strike_distribution": strike_dist
    }

def fetch_nikkei_price() -> float | None:
    """Yahoo Finance APIから日経225の現物価格を取得する"""
    url = "https://query1.finance.yahoo.com/v8/finance/chart/^N225?interval=1d&range=1d"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        with urllib.request.urlopen(req, context=ctx) as response:
            data = json.loads(response.read().decode())
            price = data['chart']['result'][0]['meta']['regularMarketPrice']
            return float(price)
    except Exception as e:
        print("Error fetching ^N225:", e)
        return None

@app.get("/api/files")
def list_files():
    """機関投資家フォルダ内の全てのExcelファイル一覧を返すエンドポイント"""
    pattern = os.path.join(DATA_DIR, "*.xlsx")
    files = sorted(glob.glob(pattern), reverse=True)  # 新しい順
    result = []
    for f in files:
        name = os.path.basename(f)
        # ファイル名から日付を抽出（YYYYMMDDパターン）
        m = re.search(r'(\d{8})', name)
        date_str = m.group(1) if m else "unknown"
        result.append({
            "filename": name,
            "date": date_str,
            "type": "whole_day" if "whole_day" in name and "J-NET" not in name else "other"
        })
    return {"files": result}

def analyze_options_for_file(file_path: str) -> dict | None:
    """
    1ファイルから日経225オプション（NK225E）の
    コール・プット別ネット出来高を集計して返す
    """
    if not os.path.exists(file_path):
        return None
    try:
        df = pd.read_excel(file_path, header=4)
        df.columns = [
            'ProductClass', 'ContractMonth', 'Code', 'Issues',
            'SellVolume', 'SellParticipant', 'BuyVolume', 'BuyParticipant'
        ]
        df = df.dropna(subset=['Code'])

        # NK225E（日経225オプション）に絞り込む
        opt = df[df['ProductClass'] == 'NK225E'].copy()
        if opt.empty:
            return None

        opt['SellVol'] = pd.to_numeric(opt['SellVolume'], errors='coerce').fillna(0)
        opt['BuyVol']  = pd.to_numeric(opt['BuyVolume'],  errors='coerce').fillna(0)

        # コードにC（コール）かP（プット）が含まれるかで分類
        opt['OptionType'] = opt['Code'].astype(str).str.extract(r'OOP\s+([CP])')[0]

        total_put_sell  = float(opt[opt['OptionType'] == 'P']['SellVol'].sum())
        total_put_buy   = float(opt[opt['OptionType'] == 'P']['BuyVol'].sum())
        total_call_sell = float(opt[opt['OptionType'] == 'C']['SellVol'].sum())
        total_call_buy  = float(opt[opt['OptionType'] == 'C']['BuyVol'].sum())

        put_net  = total_put_buy  - total_put_sell   # プット ネット（+は買い越し）
        call_net = total_call_buy - total_call_sell  # コール ネット

        total_opt_buy  = total_put_buy  + total_call_buy
        total_opt_sell = total_put_sell + total_call_sell
        pcr = total_put_sell / total_call_sell if total_call_sell > 0 else None

        return {
            "put_net":         put_net,
            "call_net":        call_net,
            "put_sell_total":  total_put_sell,
            "put_buy_total":   total_put_buy,
            "call_sell_total": total_call_sell,
            "call_buy_total":  total_call_buy,
            "pcr":             round(pcr, 4) if pcr is not None else None,
        }
    except Exception as e:
        print(f"analyze_options_for_file error ({file_path}): {e}")
        return None

@app.get("/api/timeseries")
def get_timeseries():
    """
    機関投資家フォルダ内の全 whole_day ファイルを日付順に読み込み、
    コール/プット別のネット出来高の時系列データを返すエンドポイント
    """
    pattern = os.path.join(DATA_DIR, "*whole_day.xlsx")
    files = sorted(
        [f for f in glob.glob(pattern) if "J-NET" not in os.path.basename(f)]
    )  # 古い順（左→右で時間が進む）

    series = []
    for f in files:
        name = os.path.basename(f)
        m = re.search(r'(\d{8})', name)
        date_str = m.group(1) if m else "unknown"
        # YYYYMMDD → YYYY-MM-DD
        if len(date_str) == 8:
            label = f"{date_str[:4]}/{date_str[4:6]}/{date_str[6:]}"
        else:
            label = date_str

        result = analyze_options_for_file(f)
        if result is None:
            continue

        series.append({
            "date":  label,
            "file":  name,
            **result,
        })

    return {"timeseries": series}

@app.get("/api/oi_distribution")
def get_oi_distribution():
    """
    analyze_oi.py のロジックを参考に、行使価格別の建玉残高を取得する
    """
    # デフォルトのOIデータパス（プロジェクト内の data フォルダを想定）
    # ※ローカル環境で別の場所にある場合は、ここにファイルをコピーするかシンボリックリンクを貼ることを推奨
    oi_data_dir = os.path.join(BASE_DIR, "data", "oi")
    file_path = os.path.join(oi_data_dir, "20260416open_interest.xlsx")
    
    if not os.path.exists(file_path):
        # 予備のパス（旧環境用 / 推測）
        backup_path = r"C:\Antigravity\コール_プット取引高ゾーン\jpx_oi_downloads\20260416open_interest.xlsx"
        if os.path.exists(backup_path):
            file_path = backup_path
        else:
            return {"status": "error", "message": f"OI balance file not found at {file_path}"}

    def parse_rows(df, product_prefix, oi_dict):
        for _, row in df.iterrows():
            # 左側 (Put) と 右側 (Call)
            for col_offset, cp_type_target in [(0, "Put"), (6, "Call")]:
                if col_offset >= len(row): continue
                name_val = row.iloc[col_offset]
                if pd.isna(name_val): continue
                name_str = str(name_val).strip()
                if not name_str.startswith(product_prefix): continue

                try:
                    # analyze_oi.py のカラム構成: +2 が残高
                    oi = row.iloc[col_offset + 2]
                    if not pd.api.types.is_number(oi) or pd.isna(oi): continue
                    
                    # 名前の解析 (例: "NIKKEI 225 P2604-34000")
                    parts = name_str.split()
                    cp_strike = parts[-1]
                    if "-" not in cp_strike: continue
                    _, strike_str = cp_strike.split("-", 1)
                    strike = int(float(strike_str))

                    if strike not in oi_dict:
                        oi_dict[strike] = {"strike": strike, "call_oi": 0, "put_oi": 0}
                    
                    if cp_type_target == "Call":
                        oi_dict[strike]["call_oi"] += int(oi)
                    else:
                        oi_dict[strike]["put_oi"] += int(oi)
                except Exception:
                    continue

    try:
        xl = pd.ExcelFile(file_path)
        oi_data = {}

        # シート1 (標準) と シート2 (ミニ) を解析
        for sheet_idx, prefix in [(1, "NIKKEI 225"), (2, "NK225 MINI")]:
            if len(xl.sheet_names) > sheet_idx:
                df = pd.read_excel(file_path, sheet_name=sheet_idx, header=None)
                parse_rows(df, prefix, oi_data)

        sorted_results = sorted(oi_data.values(), key=lambda x: x['strike'])
        
        return {
            "status": "success",
            "file": os.path.basename(file_path),
            "data": sorted_results
        }
    except Exception as e:
        return {"status": "error", "message": f"解析エラー: {str(e)}"}

@app.get("/api/server_info")
def get_server_info():
    """サーバーのIPアドレスを取得してスマートフォン接続を支援する"""
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # 接続しなくてもIPを取得できるダミーの宛先
        s.connect(('8.8.8.8', 1))
        local_ip = s.getsockname()[0]
    except Exception:
        local_ip = '127.0.0.1'
    finally:
        s.close()
    
    return {
        "local_ip": local_ip,
        "port": 9001,
        "url": f"http://{local_ip}:9001/src/index.html"
    }

@app.get("/api/sentiment")
def get_sentiment(filename: str = Query(default=None)):
    """機関投資家のNetポジションと総合スコアを返すエンドポイント"""
    # filenameを指定した場合はそのファイル、無指定の場合は最新のwhole_dayファイル
    if filename:
        file_path = os.path.join(DATA_DIR, filename)
    else:
        # whole_dayファイルの中で最新のものを自動選択
        pattern = os.path.join(DATA_DIR, "*whole_day.xlsx")
        candidates = sorted(
            [f for f in glob.glob(pattern) if "J-NET" not in os.path.basename(f)],
            reverse=True
        )
        if not candidates:
            return {"status": "error", "message": "No data files found in folder."}
        file_path = candidates[0]

    result = analyze_jpx_data(file_path)

    if result.get("status") == "success":
        price = fetch_nikkei_price()
        result["current_price"] = price
        result["loaded_file"] = os.path.basename(file_path)

    return result

if __name__ == "__main__":
    import uvicorn
    # コード変更時に自動リロードされるように設定
    uvicorn.run("main:app", host="0.0.0.0", port=9001, reload=True)
