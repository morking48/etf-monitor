/**
 * ETF三因子 PWA — 主入口
 * 纯前端，复用 Web 版 UI 组件
 */
let appData = null;
let isRefreshing = false;

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
                setTimeout(() => { if (typeof heatmapChart !== 'undefined' && heatmapChart) heatmapChart.resize(); }, 200);
            }
            if (tab === 'simulator') {
                setTimeout(() => { if (typeof simEquityChart !== 'undefined' && simEquityChart) simEquityChart.resize(); }, 200);
            }
        });
    });
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