/**
 * 三因子计算引擎 (前端版)
 * 可在浏览器端独立计算量能+方向概率（份额因子需后端数据）
 */

/**
 * 量能概率计算
 * 输入: 倍量(当日成交量/20日均量)
 */
function calcVolumeProb(ratio) {
    if (ratio < 0.5) return Math.max(0, ratio / 0.5 * 5);
    if (ratio < 1.0) return 5 + (ratio - 0.5) / 0.5 * 12;
    if (ratio < 1.3) return 17 + (ratio - 1) / 0.3 * 18;
    if (ratio < 1.5) return 35 + (ratio - 1.3) / 0.2 * 20;
    if (ratio < 2.0) return 55 + (ratio - 1.5) / 0.5 * 25;
    if (ratio < 3.0) return 80 + (ratio - 2) / 1 * 15;
    if (ratio < 5.0) return 95 + (ratio - 3) / 2 * 3;
    return Math.min(100, 98 + (ratio - 5) / 5 * 2);
}

/**
 * 方向概率计算
 */
function calcDirProb(etfChg, etfT5, idxT5, volRatio, idxChg) {
    // 普涨折扣
    let rallyDiscount = 1.0;
    if (idxChg > 2.0) rallyDiscount = 0.60;
    else if (idxChg > 1.5) rallyDiscount = 0.70;
    else if (idxChg > 1.0) rallyDiscount = 0.80;
    else if (idxChg > 0.5) rallyDiscount = 0.90;

    // 维度1: 当日行情特征 (40%)
    let f1;
    if (etfChg > 0.3 && idxT5 < -1) f1 = 95;
    else if (etfChg > 0 && idxT5 < -0.5) f1 = 85;
    else if (etfChg > 0 && idxT5 < 0) f1 = 70;
    else if (Math.abs(etfChg) < 0.15 && idxT5 < -1) f1 = 80;
    else if (Math.abs(etfChg) < 0.3 && idxT5 < -0.5) f1 = 65;
    else if (etfChg > 1 && volRatio > 1.5 && idxChg > 1) f1 = 25;
    else if (etfChg > 1 && volRatio > 1.5) f1 = 45;
    else if (etfChg > 0.5 && volRatio > 1.3 && idxChg > 1) f1 = 35;
    else if (etfChg > 0.5 && volRatio > 1.3) f1 = 50;
    else if (etfChg > 0) f1 = 40;
    else if (etfChg < -1.5 && volRatio > 2) f1 = 8;
    else if (etfChg < -0.5 && volRatio > 1.5) f1 = 15;
    else f1 = 25;

    // 维度2: 超额表现 (30%)
    const gap = etfT5 - idxT5;
    let f2;
    if (gap > 3) f2 = 95;
    else if (gap > 2) f2 = 85;
    else if (gap > 1.2) f2 = 75;
    else if (gap > 0.6) f2 = 60;
    else if (gap > 0.2) f2 = 50;
    else if (gap > -0.2) f2 = 40;
    else if (gap > -0.6) f2 = 30;
    else f2 = 15;

    // 维度3: 前期大盘走势 (20%)
    let f3;
    if (idxT5 < -4) f3 = 95;
    else if (idxT5 < -3) f3 = 90;
    else if (idxT5 < -2) f3 = 80;
    else if (idxT5 < -1) f3 = 70;
    else if (idxT5 < -0.5) f3 = 55;
    else if (idxT5 < 0) f3 = 45;
    else if (idxT5 < 1) f3 = 35;
    else if (idxT5 < 3) f3 = 20;
    else f3 = 10;

    // 维度4: 尾盘行为 (10%) 固定35%
    const f4 = 35;

    const raw = f1 * 0.4 + f2 * 0.3 + f3 * 0.2 + f4 * 0.1;
    return Math.round(raw * rallyDiscount * 10) / 10;
}

/**
 * 份额概率计算（与v7一致的分段线性映射）
 */
function calcShareProb(deltaPct) {
    if (deltaPct == null || deltaPct === undefined) return null;
    const ap = Math.abs(deltaPct);
    if (deltaPct > 10) return 95;
    else if (deltaPct > 5) return 80 + (deltaPct - 5) / 5 * 15;
    else if (deltaPct > 3) return 65 + (deltaPct - 3) / 2 * 15;
    else if (deltaPct > 1) return 45 + (deltaPct - 1) / 2 * 20;
    else if (deltaPct > 0) return 30 + deltaPct / 1 * 15;
    else if (deltaPct > -1) return 15 + (deltaPct + 1) / 1 * 15;
    else if (deltaPct > -5) return 5 + (deltaPct + 5) / 4 * 10;
    else return Math.max(0, 5 + (deltaPct + 5) / 5 * 5);
}

/**
 * 综合概率（三因子完整模式：vp×50% + dp×20% + sp×30%）
 * sp为null时退化为二因子：vp×70% + dp×30%
 */
function calcComposite(volProb, dirProb, shareProb) {
    if (shareProb != null) {
        return Math.round((volProb * 0.5 + dirProb * 0.2 + shareProb * 0.3) * 10) / 10;
    }
    return Math.round((volProb * 0.7 + dirProb * 0.3) * 10) / 10;
}

/**
 * 信号分级
 */
function getSignalLevel(composite) {
    if (composite >= 70) return 'HIGH';
    if (composite >= 50) return 'MID';
    return 'NORMAL';
}

/**
 * 单条K线记录的三因子分析
 * 从API返回的history数据直接使用，此函数供前端备用
 */
function analyzeSingle(code, klineData, idxKlineData, lookback, shareHistory) {
    if (!klineData || klineData.length < 22) return { history: [], threeFactor: false };
    
    const idxMap = {};
    if (idxKlineData) idxKlineData.forEach((d, j) => { idxMap[d.date] = j; });
    
    const history = [];
    let threeFactor = false;
    
    for (let i = 21; i < klineData.length; i++) {
        const d = klineData[i];
        const v = d.v / 10000;
        const pv = klineData.slice(i - 20, i).map(x => x.v / 10000);
        const ma = pv.reduce((a, b) => a + b, 0) / 20;
        if (ma === 0) continue;
        
        const vr = v / ma;
        const pc = klineData[i - 1].c;
        const chg = pc > 0 ? (d.c - pc) / pc * 100 : 0;
        const t5 = (i >= 6 && klineData[i - 5].c > 0) 
            ? (d.c - klineData[i - 5].c) / klineData[i - 5].c * 100 : 0;
        
        let idchg = 0, t5i = 0;
        const ii = idxMap[d.date];
        if (ii !== undefined && idxKlineData) {
            if (ii > 0 && idxKlineData[ii - 1].c > 0)
                idchg = (idxKlineData[ii].c - idxKlineData[ii - 1].c) / idxKlineData[ii - 1].c * 100;
            if (i >= 6 && idxMap[klineData[i - 5].date] !== undefined) {
                const j5 = idxMap[klineData[i - 5].date];
                if (idxKlineData[j5].c > 0)
                    t5i = (idxKlineData[ii].c - idxKlineData[j5].c) / idxKlineData[j5].c * 100;
            }
        }
        
        const vp = Math.round(calcVolumeProb(vr) * 10) / 10;
        const dp = calcDirProb(chg, t5, t5i, vr, idchg);
        
        // 份额因子
        let sp = null, sd = null;
        if (shareHistory && shareHistory[code] && shareHistory[code][d.date]) {
            const sh = shareHistory[code][d.date];
            sp = calcShareProb(sh.delta_pct);
            if (sp != null) { sp = Math.round(sp * 10) / 10; threeFactor = true; }
            sd = sh.delta_pct;
        }
        
        const cp = calcComposite(vp, dp, sp);
        
        history.push({
            d: d.date, c: d.c, chg: Math.round(chg * 100) / 100,
            t5: Math.round(t5 * 100) / 100, t5i: Math.round(t5i * 100) / 100,
            idx_chg: Math.round(idchg * 100) / 100,
            v: Math.round(v * 100) / 100, vma: Math.round(ma * 100) / 100,
            vr: Math.round(vr * 100) / 100,
            vp, dp, sp, sd, cp,
            signal: getSignalLevel(cp)
        });
    }
    return { history, threeFactor };
}

/**
 * 交叉验证检查
 */
function analyzeKlineData(klineData, idxKlineData) {
    if (!klineData || klineData.length < 22) return [];
    
    // 构建指数日期索引
    const idxMap = {};
    if (idxKlineData) {
        idxKlineData.forEach((d, j) => { idxMap[d.date] = j; });
    }
    
    const results = [];
    for (let i = 21; i < klineData.length; i++) {
        const d = klineData[i];
        const v = d.v / 10000; // 万手
        const pv = klineData.slice(i - 20, i).map(x => x.v / 10000);
        const ma = pv.reduce((a, b) => a + b, 0) / 20;
        if (ma === 0) continue;
        
        const vr = v / ma;
        const pc = klineData[i - 1].c;
        const chg = pc > 0 ? (d.c - pc) / pc * 100 : 0;
        
        results.push({
            d: d.date, c: d.c, chg: Math.round(chg * 100) / 100,
            v: Math.round(v * 100) / 100, vma: Math.round(ma * 100) / 100,
            vr: Math.round(vr * 100) / 100,
        });
    }
    return results;
}

/**
 * 前端本地回测 (替代 Flask /api/backtest)
 */
function doLocalBacktest(cfg) {
    const data = window.appData;
    if (!data || !data.etfs || data.etfs.length === 0) return { error: '请先刷新数据' };
    
    const etfs = data.etfs;
    // 按代码排序
    etfs.sort((a, b) => a.code.localeCompare(b.code));
    
    // 收集所有日期
    const allDates = new Set();
    etfs.forEach(e => e.history && e.history.forEach(h => allDates.add(h.d)));
    let sortedDates = [...allDates].sort();
    
    let startIdx = 0, endIdx = sortedDates.length - 1;
    if (cfg.days) {
        startIdx = Math.max(0, sortedDates.length - cfg.days);
    }
    if (cfg.start_date) {
        startIdx = sortedDates.findIndex(d => d >= cfg.start_date);
        if (startIdx < 0) startIdx = 0;
    }
    if (cfg.end_date) {
        endIdx = sortedDates.findIndex(d => d > cfg.end_date);
        if (endIdx < 0) endIdx = sortedDates.length - 1;
        else if (endIdx > 0) endIdx--;
    }
    
    if (startIdx >= endIdx) return { error: '回测区间过短' };
    
    const startDate = sortedDates[startIdx];
    const endDate = sortedDates[endIdx];
    
    // 简单模拟
    const initialCapital = 100000;
    let cash = initialCapital;
    let positions = []; // { code, name, shares, costPrice, buyDate, buyCp }
    let trades = [];
    let totalValue = initialCapital;
    let benchmarkBase = null;
    
    for (let di = startIdx; di <= endIdx; di++) {
        const date = sortedDates[di];
        if (!date) continue;
        
        // 计算当日基准
        if (di === startIdx) {
            const idxE = etfs.find(e => e.index === '沪深300');
            if (idxE) {
                const h = idxE.history.find(h => h.d === date);
                if (h) benchmarkBase = h.c;
            }
        }
        
        // 结算持仓市值
        let mv = 0;
        for (const pos of positions) {
            const e = etfs.find(e => e.code === pos.code);
            if (!e) continue;
            const h = e.history.find(h => h.d === date);
            if (h) {
                pos.currentPrice = h.c;
                pos.marketValue = pos.shares * h.c;
                pos.pnl = pos.marketValue - pos.shares * pos.costPrice;
                mv += pos.marketValue;
            }
        }
        totalValue = cash + mv;
        
        // 检查卖出信号
        const toRemove = [];
        for (const pos of positions) {
            const e = etfs.find(e => e.code === pos.code);
            if (!e) continue;
            const h = e.history.find(h => h.d === date);
            if (!h) continue;
            
            const pnlPct = (h.c - pos.costPrice) / pos.costPrice * 100;
            let sellReason = null;
            if (pnlPct <= -5) sellReason = `止损 ${pnlPct.toFixed(1)}%`;
            else if (h.cp < 40) sellReason = `信号消退 CP=${h.cp.toFixed(0)}%`;
            
            if (sellReason && h.c > 0) {
                const income = pos.shares * h.c;
                const cost = pos.shares * pos.costPrice;
                trades.push({ date, action: 'SELL', code: pos.code, name: pos.name, shares: pos.shares, price: h.c, amount: income, pnl: income - cost, reason: sellReason });
                cash += income;
                toRemove.push(pos.code);
            }
        }
        positions = positions.filter(p => !toRemove.includes(p.code));
        
        // 检查买入信号
        const buyThreshold = cfg.buy_threshold || 70;
        const positionRatio = cfg.position_ratio || 0.3;
        const maxPositions = 4;
        
        for (const e of etfs) {
            if (positions.length >= maxPositions) break;
            if (positions.find(p => p.code === e.code)) continue;
            const h = e.history.find(h => h.d === date);
            if (!h || h.cp < buyThreshold || cash < 5000) continue;
            
            const alloc = Math.min(initialCapital * positionRatio, cash * 0.95);
            const shares = Math.floor(alloc / h.c / 100) * 100;
            if (shares < 100) continue;
            
            const amount = shares * h.c;
            trades.push({ date, action: 'BUY', code: e.code, name: e.name, shares, price: h.c, amount, reason: `信号 CP=${h.cp.toFixed(0)}%` });
            positions.push({ code: e.code, name: e.name, shares, costPrice: h.c, buyDate: date, buyCp: h.cp });
            cash -= amount;
        }
    }
    
    // 清仓
    for (const pos of positions) {
        const e = etfs.find(e => e.code === pos.code);
        const lastH = e && e.history.length > 0 ? e.history[e.history.length - 1] : null;
        const price = lastH ? lastH.c : pos.costPrice;
        const income = pos.shares * price;
        const cost = pos.shares * pos.costPrice;
        trades.push({ date: endDate, action: 'SELL', code: pos.code, name: pos.name, shares: pos.shares, price, amount: income, pnl: income - cost, reason: '强制清仓' });
        cash += income;
    }
    positions = [];
    totalValue = cash;
    
    const totalReturn = ((totalValue - initialCapital) / initialCapital * 100).toFixed(1);
    const sellTrades = trades.filter(t => t.action === 'SELL' && t.pnl != null);
    const winCount = sellTrades.filter(t => t.pnl > 0).length;
    const winRate = sellTrades.length > 0 ? Math.round(winCount / sellTrades.length * 100) : 0;
    
    return {
        start_date: startDate,
        end_date: endDate,
        initial_capital: initialCapital,
        final_value: parseFloat(totalValue.toFixed(2)),
        total_return: parseFloat(totalReturn),
        total_trades: trades.length,
        buy_count: trades.filter(t => t.action === 'BUY').length,
        sell_count: trades.filter(t => t.action === 'SELL').length,
        win_rate: winRate,
        win_count: winCount,
        max_drawdown: 'N/A',
        sharpe: 'N/A',
        trades,
    };
}

function checkCrossValidation(results) {
    const highCodes = results
        .filter(r => r.latest && r.latest.cp >= 70)
        .map(r => r.code);
    const midCodes = results
        .filter(r => r.latest && r.latest.cp >= 50 && r.latest.cp < 70)
        .map(r => r.code);
    const hs300Codes = ['510300', '510310', '510330', '159919'];
    const hs300Alerts = [...highCodes, ...midCodes].filter(c => hs300Codes.includes(c));
    
    return {
        highCount: highCodes.length,
        midCount: midCodes.length,
        totalAlert: highCodes.length + midCodes.length,
        hs300Alerts: hs300Alerts.length,
        isStrong: highCodes.length >= 2 || hs300Alerts.length >= 3,
        verdict: highCodes.length >= 2 
            ? `🔥 ${highCodes.length}只高确信，${hs300Alerts.length}/4只沪深300同步` 
            : highCodes.length >= 1 
                ? `⚠️ 部分ETF触发高确信` 
                : midCodes.length >= 2 
                    ? `📊 ${midCodes.length}只中等信号` 
                    : `✅ 全市场正常`
    };
}