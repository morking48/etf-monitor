/**
 * 数据获取层 (PWA v3 - Vercel 后端)
 * K线：浏览器直连腾讯财经 API（缓存友好）
 * 三因子分析 + 份额：调用 Vercel 后端（akshare 稳定获取）
 */

// ========== 配置 ==========
// 部署到 Vercel 后，修改为你的 Vercel 域名
// 例如: 'https://etf-monitor.vercel.app'
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'  // 本地开发：直连 Flask 后端
    : 'https://etf-monitor-alpha.vercel.app';  // 生产环境：Vercel 后端

// ========== 主刷新入口 ==========
async function doRefresh() {
    const btn = document.getElementById('btnRefresh');
    const info = document.getElementById('refreshInfo');
    if (btn) btn.disabled = true;
    if (info) info.textContent = '⏳ 获取数据中...（含份额因子约需18秒）';

    try {
        const resp = await fetch(API_BASE_URL + '/api/analysis');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        
        appData = data;
        window.appData = data;
        
        // 触发 Web 版 UI 刷新
        if (typeof renderSummaryCards === 'function') renderSummaryCards(data.summary);
        if (typeof renderDashboard === 'function') renderDashboard(data);
        if (typeof initDetailSelect === 'function') initDetailSelect(data.etfs);
        if (typeof initHistory === 'function') initHistory(data);
        if (typeof renderReport === 'function') renderReport(data);
        if (typeof updateSimulator === 'function') updateSimulator(data);

        // 更新状态
        const timeEl = document.getElementById('headerTime');
        const dateEl = document.getElementById('headerDate');
        if (timeEl) timeEl.textContent = new Date().toLocaleTimeString();
        if (dateEl) dateEl.textContent = data.target_date;
        if (info) info.textContent = `✅ ${data.mode === 'three_factor' ? '三因子' : '二因子'}模式 | ${data.target_date}`;
        
        // 更新模式标签
        const modeEl = document.getElementById('headerModelMode');
        if (modeEl) {
            if (data.mode === 'three_factor') {
                modeEl.textContent = '量能50% + 方向20% + 份额30%（✅ 三因子完整模式）';
                modeEl.style.color = 'var(--signal-low)';
            } else {
                modeEl.textContent = '量能70% + 方向30%（⚠️ 二因子降级，份额暂缺）';
                modeEl.style.color = 'var(--signal-mid)';
            }
        }
        
        const dot = document.getElementById('statusDot');
        if (dot) { dot.classList.add('ok'); dot.title = data.mode === 'three_factor' ? '三因子完整' : '二因子降级'; }

    } catch (e) {
        console.error('刷新失败:', e);
        if (info) info.textContent = '❌ 后端连接失败: ' + e.message;
    } finally {
        if (btn) btn.disabled = false;
    }
}

window.appData = null;