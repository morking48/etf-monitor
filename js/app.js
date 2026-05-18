/**
 * ETF三因子 PWA — 主入口
 * 纯前端，复用 Web 版 UI 组件
 */
let appData = null;
let isRefreshing = false;
let lastRefreshMinute = -1;

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🛡️ ETF三因子 PWA 启动...');
    
    // 初始化 Tab 导航
    initTabNav();
    
    // 初始化历史 Tab 日期按钮
    const prevBtn = document.getElementById('btnPrevDate');
    const nextBtn = document.getElementById('btnNextDate');
    if (prevBtn) prevBtn.addEventListener('click', () => navigateHistory('prev'));
    if (nextBtn) nextBtn.addEventListener('click', () => navigateHistory('next'));
    
    // 设置状态为正常（无后端依赖）
    const dot = document.getElementById('statusDot');
    if (dot) { dot.classList.add('ok'); dot.title = '直连腾讯API'; }
    
    // 自动首次刷新
    setTimeout(doRefresh, 500);
    
    // 开启定时自动刷新
    initAutoRefresh();
});

// ========== Tab 路由 ==========
function initTabNav() {
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            const panel = document.getElementById('panel-' + tab);
            if (panel) panel.classList.add('active');
            
            // 切换到详情时 resize ECharts
            if (tab === 'detail') {
                setTimeout(() => {
                    [gaugeChartVp, gaugeChartDp, gaugeChartCp, trendChart].forEach(c => c && c.resize());
                }, 200);
            }
            if (tab === 'history') {
                if (appData && (!historyDateList || !historyDateList.length)) {
                    initHistory(appData);
                }
                setTimeout(() => { if (typeof heatmapChart !== 'undefined' && heatmapChart) heatmapChart.resize(); }, 200);
            }
            if (tab === 'simulator') {
                setTimeout(() => { if (typeof simEquityChart !== 'undefined' && simEquityChart) simEquityChart.resize(); }, 200);
            }
        });
    });
}

// ========== 自动刷新 ==========
function initAutoRefresh() {
    setInterval(() => {
        const now = new Date();
        const day = now.getDay();
        
        // 过滤周末
        if (day === 0 || day === 6) return;

        const h = now.getHours();
        const m = now.getMinutes();

        // 指定刷新时间：09:30, 10:00, 10:30, 11:00, 11:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00
        const targetTimes = [
            [9, 30], [10, 0], [10, 30], [11, 0], [11, 30],
            [13, 0], [13, 30], [14, 0], [14, 30], [15, 0], [15, 30], [16, 0]
        ];

        const isTarget = targetTimes.some(t => t[0] === h && t[1] === m);

        if (isTarget && lastRefreshMinute !== m) {
            lastRefreshMinute = m;
            console.log(`[自动刷新] 触发时间: ${h}:${m.toString().padStart(2, '0')}`);
            if (typeof doRefresh === 'function') doRefresh();
        }
    }, 10000); // 每10秒检测一次
}

// ========== 暴露给 api.js 的回调 (Web 版 UI 对接) ==========
function setStatusDot() {} // no-op: 纯前端
function updateHeaderTime(time, date) {
    const t = document.getElementById('headerTime');
    const d = document.getElementById('headerDate');
    if (t) t.textContent = time;
    if (d) d.textContent = date;
}
function showError(msg) {
    const info = document.getElementById('refreshInfo');
    if (info) info.textContent = '❌ ' + msg;
}
function showLoading() {}
function hideLoading() {}