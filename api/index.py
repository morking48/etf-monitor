"""
ETF三因子分析 Vercel Flask Backend
同时提供 API 和静态文件服务
"""
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
import json
import urllib.request
import ssl
import os
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

# 静态文件根目录（etf-app/）
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

ETFS = {
    "510300": {"n": "华泰柏瑞沪深300ETF", "idx": "沪深300"},
    "510310": {"n": "易方达沪深300ETF",   "idx": "沪深300"},
    "510330": {"n": "华夏沪深300ETF",     "idx": "沪深300"},
    "159919": {"n": "嘉实沪深300ETF",     "idx": "沪深300"},
    "510050": {"n": "华夏上证50ETF",      "idx": "上证50"},
    "510500": {"n": "华泰柏瑞中证500ETF",  "idx": "中证500"},
    "512100": {"n": "南方中证1000ETF",    "idx": "中证1000"},
}


# ============================================================
# 静态文件路由
# ============================================================

@app.route('/')
def serve_index():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    # API 请求不走这里（Flask 路由优先匹配更具体的）
    full = os.path.join(BASE_DIR, path)
    if os.path.isfile(full):
        return send_from_directory(BASE_DIR, path)
    # 前端路由 fallback（如 /detail/510300）
    return send_from_directory(BASE_DIR, 'index.html')


# ============================================================
# 数据获取
# ============================================================

def fetch_kline(code, limit=60):
    """获取K线 - 腾讯财经API"""
    if code.startswith("sh") or code.startswith("sz"):
        pfx, numcode = code[:2], code[2:]
    else:
        pfx = "sh" if code.startswith(("51", "56", "0")) else "sz"
        numcode = code
    u = f"http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={pfx}{numcode},day,,,{limit},qfq"
    try:
        r = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(r, timeout=15, context=ssl_ctx) as resp:
            d = json.loads(resp.read().decode("utf-8"))
        k = d.get("data", {}).get(f"{pfx}{numcode}", {}).get("day", []) or \
            d.get("data", {}).get(f"{pfx}{numcode}", {}).get("qfqday", [])
        return [{"date": r[0], "o": float(r[1]), "c": float(r[2]),
                 "h": float(r[3]), "l": float(r[4]), "v": float(r[5])}
                for r in k if len(r) >= 6 and r[0]]
    except:
        return []


def fetch_share_history(codes, target_date, lookback=5):
    """获取ETF份额历史（akshare，约18秒）"""
    history = {}
    try:
        import akshare
    except ImportError:
        return history

    end_dt = datetime.strptime(target_date, '%Y-%m-%d')
    start_dt = end_dt - timedelta(days=lookback)

    sse_codes = [c for c in codes if c.startswith(('51', '56'))]
    szse_codes = [c for c in codes if c.startswith(('15', '16'))]

    current = end_dt
    while current >= start_dt:
        ds = current.strftime('%Y%m%d')
        try:
            df = akshare.fund_etf_scale_sse(date=ds)
            if df is not None and len(df) > 0 and '基金代码' in df.columns:
                for _, row in df.iterrows():
                    code = str(row['基金代码'])
                    if code in sse_codes:
                        d = current.strftime('%Y-%m-%d')
                        if code not in history:
                            history[code] = {}
                        try:
                            shares = float(row['基金份额'])
                            history[code][d] = {'shares_yi': round(shares, 2), 'date': d}
                        except:
                            pass
        except:
            pass
        current -= timedelta(days=1)

    if szse_codes:
        start_str = start_dt.strftime('%Y%m%d')
        end_str = end_dt.strftime('%Y%m%d')
        try:
            df = akshare.fund_scale_daily_szse(start_date=start_str, end_date=end_str, symbol='ETF')
            if df is not None and len(df) > 0:
                for _, row in df.iterrows():
                    code = str(row['基金代码'])
                    if code in szse_codes:
                        d = str(row['日期'])[:10].replace('-', '')
                        d_fmt = f"{d[:4]}-{d[4:6]}-{d[6:8]}"
                        if code not in history:
                            history[code] = {}
                        history[code][d_fmt] = {'shares_yi': round(float(row['基金份额']) / 1e8, 2), 'date': d_fmt}
        except:
            pass

    for code, dates in history.items():
        sorted_dates = sorted(dates.keys())
        for i, d in enumerate(sorted_dates):
            if i > 0:
                prev = dates[sorted_dates[i - 1]]['shares_yi']
                curr = dates[d]['shares_yi']
                if prev > 0:
                    delta = curr - prev
                    dates[d]['delta_yi'] = round(delta, 2)
                    dates[d]['delta_pct'] = round(delta / prev * 100, 2)

    return history


# ============================================================
# 三因子计算
# ============================================================

def vprob(r):
    if r < 0.5: return max(0, r / 0.5 * 5)
    if r < 1.0: return 5 + (r - 0.5) / 0.5 * 12
    if r < 1.3: return 17 + (r - 1) / 0.3 * 18
    if r < 1.5: return 35 + (r - 1.3) / 0.2 * 20
    if r < 2.0: return 55 + (r - 1.5) / 0.5 * 25
    if r < 3.0: return 80 + (r - 2) / 1 * 15
    if r < 5.0: return 95 + (r - 3) / 2 * 3
    return min(100, 98 + (r - 5) / 5 * 2)


def dprob(etf_chg, t5, t5i, vr, idx_chg):
    discount = 1.0
    if idx_chg > 2.0: discount = 0.60
    elif idx_chg > 1.5: discount = 0.70
    elif idx_chg > 1.0: discount = 0.80
    elif idx_chg > 0.5: discount = 0.90

    if etf_chg > 0.3 and t5i < -1: f1 = 95
    elif etf_chg > 0 and t5i < -0.5: f1 = 85
    elif etf_chg > 0 and t5i < 0: f1 = 70
    elif abs(etf_chg) < 0.15 and t5i < -1: f1 = 80
    elif abs(etf_chg) < 0.3 and t5i < -0.5: f1 = 65
    elif etf_chg > 1 and vr > 1.5 and idx_chg > 1: f1 = 25
    elif etf_chg > 1 and vr > 1.5: f1 = 45
    elif etf_chg > 0.5 and vr > 1.3 and idx_chg > 1: f1 = 35
    elif etf_chg > 0.5 and vr > 1.3: f1 = 50
    elif etf_chg > 0: f1 = 40
    elif etf_chg < -1.5 and vr > 2: f1 = 8
    elif etf_chg < -0.5 and vr > 1.5: f1 = 15
    else: f1 = 25

    gap = t5 - t5i
    if gap > 3: f2 = 95
    elif gap > 2: f2 = 85
    elif gap > 1.2: f2 = 75
    elif gap > 0.6: f2 = 60
    elif gap > 0.2: f2 = 50
    elif gap > -0.2: f2 = 40
    elif gap > -0.6: f2 = 30
    else: f2 = 15

    if t5i < -4: f3 = 95
    elif t5i < -3: f3 = 90
    elif t5i < -2: f3 = 80
    elif t5i < -1: f3 = 70
    elif t5i < -0.5: f3 = 55
    elif t5i < 0: f3 = 45
    elif t5i < 1: f3 = 35
    elif t5i < 3: f3 = 20
    else: f3 = 10

    f4 = 35
    return round((f1 * 0.4 + f2 * 0.3 + f3 * 0.2 + f4 * 0.1) * discount, 1)


def sprob(share_delta_pct):
    if share_delta_pct > 10: return 95
    elif share_delta_pct > 5: return 80 + (share_delta_pct - 5) / 5 * 15
    elif share_delta_pct > 3: return 65 + (share_delta_pct - 3) / 2 * 15
    elif share_delta_pct > 1: return 45 + (share_delta_pct - 1) / 2 * 20
    elif share_delta_pct > 0: return 30 + share_delta_pct / 1 * 15
    elif share_delta_pct > -1: return 15 + (share_delta_pct + 1) / 1 * 15
    elif share_delta_pct > -5: return 5 + (share_delta_pct + 5) / 4 * 10
    else: return max(0, 5 + (share_delta_pct + 5) / 5 * 5)


def align_idx(etf_data, idx_data):
    idx_map = {d["date"]: i for i, d in enumerate(idx_data)}
    return [idx_map.get(d["date"]) for d in etf_data]


def analyze_single(code, data, idx_d, days=35, share_data=None):
    if len(data) < 22:
        return [], False

    res = []
    aligned = align_idx(data, idx_d)
    three_factor_mode = False

    for i in range(max(21, len(data) - days), len(data)):
        d = data[i]
        v = d["v"] / 10000
        pv = [data[j]["v"] / 10000 for j in range(i - 20, i)]
        ma = sum(pv) / 20
        if ma == 0:
            continue

        vr = v / ma
        pc = data[i - 1]["c"]
        chg = (d["c"] - pc) / pc * 100 if pc > 0 else 0
        t5 = (d["c"] - data[i - 5]["c"]) / data[i - 5]["c"] * 100 if i >= 6 and data[i - 5]["c"] > 0 else 0
        t5i = 0; idchg = 0
        if i < len(aligned) and aligned[i] is not None:
            ii = aligned[i]
            if ii > 0 and idx_d[ii - 1]["c"] > 0:
                idchg = round((idx_d[ii]["c"] - idx_d[ii - 1]["c"]) / idx_d[ii - 1]["c"] * 100, 2)
            if i >= 6 and aligned[i - 5] is not None:
                j5 = aligned[i - 5]
                if idx_d[j5]["c"] > 0:
                    t5i = round((idx_d[ii]["c"] - idx_d[j5]["c"]) / idx_d[j5]["c"] * 100, 2)

        vp = round(vprob(vr), 1)
        dp = dprob(chg, t5, t5i, vr, idchg)

        sp = None; sd = None
        if share_data and code in share_data and d["date"] in share_data[code]:
            info = share_data[code][d["date"]]
            sd = info.get('delta_pct')
            sp = sprob(sd) if sd is not None else None

        if sp is not None:
            cp = round(vp * 0.5 + dp * 0.2 + sp * 0.3, 1)
            three_factor_mode = True
        else:
            cp = round(vp * 0.7 + dp * 0.3, 1)

        res.append({
            "d": d["date"], "c": d["c"], "chg": round(chg, 2),
            "t5": round(t5, 2), "t5i": t5i, "idx_chg": idchg,
            "v": round(v, 2), "vma": round(ma, 2), "vr": round(vr, 2),
            "vp": vp, "dp": dp,
            "sp": round(sp, 1) if sp is not None else None, "sd": sd,
            "cp": cp, "signal": "HIGH" if cp >= 70 else ("MID" if cp >= 50 else "NORMAL"),
        })

    return res, three_factor_mode


# ============================================================
# API 路由
# ============================================================

@app.route('/api/health')
def health():
    return jsonify({"status": "ok", "time": datetime.now().isoformat()})


@app.route('/api/etfs')
def get_etfs():
    return jsonify([{"code": c, "name": i["n"], "index": i["idx"]} for c, i in ETFS.items()])


@app.route('/api/kline/<code>')
def get_kline(code):
    data = fetch_kline(code)
    return jsonify({"code": code, "count": len(data), "data": data})


@app.route('/api/analysis')
def get_analysis():
    codes = list(ETFS.keys())

    idx_data = fetch_kline("sh000300", 60)
    first_kline = fetch_kline(codes[0], 60)
    target_date = first_kline[-1]["date"] if first_kline else datetime.now().strftime('%Y-%m-%d')

    share_data = fetch_share_history(codes, target_date, lookback=5)
    share_available = len(share_data) > 0

    results = []
    any_three_factor = False
    for code, info in ETFS.items():
        kline = fetch_kline(code, 60)
        if len(kline) < 22:
            results.append({"code": code, "name": info["n"], "index": info["idx"],
                "error": f"数据不足({len(kline)}条)", "history": [], "latest": None})
            continue
        hist, tf = analyze_single(code, kline, idx_data, 35, share_data)
        if tf: any_three_factor = True
        results.append({"code": code, "name": info["n"], "index": info["idx"],
            "history": hist, "latest": hist[-1] if hist else None})

    high_count = sum(1 for r in results if r["latest"] and r["latest"]["cp"] >= 70)
    mid_count = sum(1 for r in results if r["latest"] and 50 <= r["latest"]["cp"] < 70)
    normal_count = sum(1 for r in results if r["latest"] and r["latest"]["cp"] < 50)
    error_count = sum(1 for r in results if r["latest"] is None)
    hs300_codes = ["510300", "510310", "510330", "159919"]
    hs300_high = sum(1 for r in results if r["code"] in hs300_codes and r["latest"] and r["latest"]["cp"] >= 50)

    volume_ranking = []
    for r in results:
        if r["latest"]:
            vr = r["latest"]["vr"]
            label = "极端放量" if vr >= 2.0 else ("显著放量" if vr >= 1.5 else ("温和放量" if vr >= 1.0 else "正常"))
            volume_ranking.append({
                "code": r["code"], "name": r["name"], "index": r["index"],
                "vr": vr, "v": r["latest"]["v"], "vma": r["latest"]["vma"],
                "chg": r["latest"]["chg"], "cp": r["latest"]["cp"], "label": label
            })
    volume_ranking.sort(key=lambda x: x["vr"], reverse=True)

    up_count = sum(1 for r in results if r["latest"] and r["latest"]["chg"] > 0)
    down_count = sum(1 for r in results if r["latest"] and r["latest"]["chg"] < 0)
    if up_count >= len(results) * 0.75: direction = "强一致看多"
    elif down_count >= len(results) * 0.75: direction = "强一致看空"
    elif up_count > down_count: direction = "偏多"
    elif down_count > up_count: direction = "偏空"
    else: direction = "分歧"

    valid_cps = [r["latest"]["cp"] for r in results if r["latest"]]
    avg_cp = round(sum(valid_cps) / len(valid_cps), 1) if valid_cps else 0
    if avg_cp >= 70: rating = "🔴 高确信 — 国家队大概率正在积极增持宽基ETF"
    elif avg_cp >= 50: rating = "🟡 中等确信 — 值得关注，等待更多确认信号"
    elif avg_cp >= 30: rating = "🟠 低确信 — 异常放量但无法归因于国家队"
    else: rating = "⚪ 无信号 — 正常交易，未检测到国家队操作痕迹"

    date_sig = {}
    for r in results:
        for h in r["history"]:
            d = h["d"]
            if d not in date_sig: date_sig[d] = {"total": 0, "high": 0, "mid": 0, "codes": []}
            date_sig[d]["total"] += 1
            if h["cp"] >= 70:
                date_sig[d]["high"] += 1
                date_sig[d]["codes"].append(f"{r['code']}({h['cp']:.0f}%)")
            elif h["cp"] >= 50: date_sig[d]["mid"] += 1
    signal_backtrack = []
    for d, v in date_sig.items():
        if v["high"] >= 2 or v["high"] + v["mid"] >= 4:
            signal_backtrack.append({"date": d, "high": v["high"], "mid": v["mid"], "codes": v["codes"][:5]})
    signal_backtrack.sort(key=lambda x: x["date"], reverse=True)

    return jsonify({
        "time": datetime.now().isoformat(),
        "target_date": target_date,
        "mode": "three_factor" if any_three_factor else "two_factor",
        "share_available": share_available,
        "summary": {"high": high_count, "mid": mid_count, "normal": normal_count, "error": error_count, "hs300_alert": hs300_high},
        "report": {"rating": rating, "avg_cp": avg_cp, "volume_ranking": volume_ranking,
            "direction": {"up": up_count, "down": down_count, "consensus": direction},
            "signal_backtrack": signal_backtrack[:10]},
        "etfs": results
    })


@app.route('/api/backtest', methods=['POST'])
def backtest():
    """历史回测：基于三因子信号模拟交易，支持自定义日期区间"""
    import math
    from flask import request
    data = request.get_json(silent=True) or {}
    days = data.get('days', 30)
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    position_ratio = data.get('position_ratio', 0.30)
    buy_threshold = data.get('buy_threshold', 70)
    fee_rate = data.get('fee_rate', 0.00025)
    initial_capital = data.get('initial_capital', 100000)

    codes = list(ETFS.keys())
    max_kline_days = max(60, days + 30)
    if start_date and end_date:
        max_kline_days = 250
    idx_data = fetch_kline("sh000300", max_kline_days)

    all_hist = {}
    share_data = {}
    first_kline = fetch_kline(codes[0], max(60, days + 30))
    if not first_kline:
        return jsonify({"error": "无法获取K线数据"}), 500
    target_date = first_kline[-1]["date"]

    try:
        share_data = fetch_share_history(codes, target_date, lookback=5)
    except:
        pass

    for code in codes:
        kline = fetch_kline(code, max_kline_days)
        if len(kline) < 22:
            continue
        lookback = min(len(kline) - 5, max_kline_days - 5) if start_date else (days + 5)
        hist, _ = analyze_single(code, kline, idx_data, lookback, share_data)
        if hist:
            all_hist[code] = hist

    if len(all_hist) < 3:
        return jsonify({"error": "可分析ETF不足3只"}), 500

    date_map = {}
    for code, hist in all_hist.items():
        for h in hist:
            d = h["d"]
            if d not in date_map:
                date_map[d] = {}
            date_map[d][code] = h

    all_sorted_dates = sorted(date_map.keys())
    
    if start_date and end_date:
        sorted_dates = [d for d in all_sorted_dates if start_date <= d <= end_date]
    else:
        sorted_dates = all_sorted_dates[-days:]

    if not sorted_dates:
        return jsonify({"error": "指定区间内无数据"}), 400

    cash = initial_capital
    positions = {}
    trades = []

    for d in sorted_dates:
        day_data = date_map[d]

        total_mv = 0
        for code, pos in list(positions.items()):
            if code in day_data:
                pos["current_price"] = day_data[code]["c"]
                pos["market_value"] = pos["shares"] * pos["current_price"]
                total_mv += pos["market_value"]
                pos["hold_days"] = pos.get("hold_days", 0) + 1

        for code, pos in list(positions.items()):
            if code not in day_data:
                continue
            h = day_data[code]
            sell_reason = None
            pnl_pct = (pos["current_price"] - pos["cost_price"]) / pos["cost_price"] * 100 if pos["cost_price"] > 0 else 0

            if pnl_pct <= -5:
                sell_reason = f"硬止损: 亏损{pnl_pct:.1f}%"
            elif h["cp"] < 40:
                sell_reason = f"信号消退: CP={h['cp']:.0f}%"
            elif pos.get("hold_days", 0) >= 10 and pnl_pct <= 0:
                sell_reason = f"时间止损: 持有{pos['hold_days']}天未盈利"

            if sell_reason:
                shares = pos["shares"]
                income = shares * pos["current_price"]
                fee = max(5, income * fee_rate)
                actual_income = income - fee
                pnl = actual_income - shares * pos["cost_price"]
                cash += actual_income
                trades.append({
                    "date": d, "action": "SELL", "code": code,
                    "price": round(pos["current_price"], 3), "shares": int(shares),
                    "amount": round(actual_income, 2), "fee": round(fee, 2),
                    "pnl": round(pnl, 2), "reason": sell_reason,
                    "hold_days": pos.get("hold_days", 0)
                })
                del positions[code]

        total_value = cash + sum(p.get("market_value", 0) for p in positions.values())
        used_ratio = (total_value - cash) / total_value if total_value > 0 else 0

        if used_ratio < 0.80:
            eligible = []
            for code, h in day_data.items():
                if code in positions:
                    continue
                if h["cp"] >= buy_threshold:
                    eligible.append((code, h))

            if eligible:
                code, h = max(eligible, key=lambda x: x[1]["cp"])
                max_buy = min(total_value * position_ratio, cash * 0.95)
                fee = max(5, max_buy * fee_rate)
                shares = math.floor((max_buy - fee) / h["c"] / 100) * 100
                if shares >= 100:
                    cost = shares * h["c"] + fee
                    cash -= cost
                    positions[code] = {
                        "shares": shares,
                        "cost_price": h["c"],
                        "current_price": h["c"],
                        "market_value": shares * h["c"],
                        "hold_days": 0
                    }
                    trades.append({
                        "date": d, "action": "BUY", "code": code,
                        "price": round(h["c"], 3), "shares": int(shares),
                        "amount": round(cost, 2), "fee": round(fee, 2),
                        "reason": f"三因子高确信: CP={h['cp']:.0f}%"
                    })

    final_mv = sum(p.get("market_value", 0) for p in positions.values())
    final_value = cash + final_mv
    total_return = round((final_value - initial_capital) / initial_capital * 100, 2)

    sell_trades = [t for t in trades if t["action"] == "SELL"]
    buy_trades = [t for t in trades if t["action"] == "BUY"]
    win_trades = [t for t in sell_trades if t.get("pnl", 0) > 0]
    win_rate = round(len(win_trades) / len(sell_trades) * 100, 1) if sell_trades else 0

    eq = [initial_capital]
    cash_tmp = initial_capital
    pos_tmp = {}
    for d in sorted_dates:
        day_data = date_map[d]
        for code, pos in pos_tmp.items():
            if code in day_data:
                pos["mv"] = pos["shares"] * day_data[code]["c"]
        for t in trades:
            if t["date"] == d:
                if t["action"] == "BUY":
                    cash_tmp -= t["amount"]
                    pos_tmp[t["code"]] = {"shares": t["shares"], "mv": t["shares"] * t["price"]}
                elif t["action"] == "SELL" and t["code"] in pos_tmp:
                    cash_tmp += t["amount"]
                    del pos_tmp[t["code"]]
        eq.append(cash_tmp + sum(p["mv"] for p in pos_tmp.values()))
    
    peak = eq[0]
    max_dd = 0
    for v in eq:
        if v > peak:
            peak = v
        dd = (peak - v) / peak * 100 if peak > 0 else 0
        if dd > max_dd:
            max_dd = dd
    max_dd = round(max_dd, 2)

    daily_returns = []
    for i in range(1, len(eq)):
        if eq[i - 1] > 0:
            daily_returns.append((eq[i] - eq[i - 1]) / eq[i - 1])
    if daily_returns:
        avg_ret = sum(daily_returns) / len(daily_returns)
        std_ret = (sum((r - avg_ret) ** 2 for r in daily_returns) / len(daily_returns)) ** 0.5
        sharpe = round(avg_ret / std_ret * (252 ** 0.5), 2) if std_ret > 0 else 0
    else:
        sharpe = 0

    return jsonify({
        "start_date": sorted_dates[0] if sorted_dates else "",
        "end_date": sorted_dates[-1] if sorted_dates else "",
        "data_start_date": all_sorted_dates[0] if all_sorted_dates else "",
        "data_end_date": all_sorted_dates[-1] if all_sorted_dates else "",
        "warning": ("请求区间超出数据范围，已自动截取" if (start_date and all_sorted_dates and start_date < all_sorted_dates[0]) else ""),
        "initial_capital": initial_capital,
        "final_value": round(final_value, 2),
        "total_return": total_return,
        "total_trades": len(trades),
        "buy_count": len(buy_trades),
        "sell_count": len(sell_trades),
        "win_count": len(win_trades),
        "win_rate": win_rate,
        "max_drawdown": str(max_dd),
        "sharpe": str(sharpe),
        "trades": trades[:20]
    })


# ============================================================
# Vercel 入口（Flask preset 需要 app 变量）
# ============================================================
if __name__ == '__main__':
    app.run(debug=True)
