# ETF三因子 PWA 部署与运维指南

## 架构总览

```
┌─────────────────────────────────────────────────────────┐
│  用户手机浏览器 (PWA)                                     │
│  ├─ index.html + CSS + JS (静态资源)                     │
│  ├─ Service Worker (离线缓存 + K线API缓存)               │
│  └─ fetch('/api/analysis')                              │
│         │                                                │
└─────────┼────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│  Vercel Serverless (Python)                              │
│  api/index.py:                                           │
│  ├─ fetch_kline() → 腾讯财经API (浏览器也可直连)          │
│  ├─ fetch_share_history() → akshare (上交所+深交所份额)   │
│  └─ analyze_single() → 三因子计算引擎                     │
│         │                                                │
│         ├── vprob() 量能概率 (0-100%)                    │
│         ├── dprob() 方向概率 (0-100%)                    │
│         ├── sprob() 份额概率 (0-100%)                    │
│         └── cp = vp×50% + dp×20% + sp×30%              │
└─────────────────────────────────────────────────────────┘
```

## 一、部署到 Vercel（推荐方案）

### 1.1 前提条件
- GitHub 账号
- Vercel 账号（用 GitHub 登录 https://vercel.com）

### 1.2 部署步骤

```bash
# 1. 在 etf-app 目录初始化 Git（如果还未初始化）
cd etf-app
git init
git add -A
git commit -m "ETF三因子 PWA + Vercel Backend"

# 2. 推送到 GitHub
git remote add origin https://github.com/你的用户名/etf-monitor.git
git push -u origin main

# 3. 在 Vercel 控制台:
#    - New Project → Import Git Repository → 选择 etf-monitor
#    - Framework Preset: Other
#    - Root Directory: etf-app
#    - Build Command: (留空)
#    - Output Directory: (留空)
#    - Deploy!

# 4. 部署完成后，回到代码中修改前端 API 地址
#    编辑 api.js，修改第11行 API_BASE_URL
```

### 1.3 Vercel 免费配额
| 项目 | 限额 |
|------|------|
| 带宽 | 100 GB/月 |
| 函数执行时间 | 30秒/次 (本应用约18秒) |
| 函数调用次数 | 100万次/月 |
| 并发请求 | 60个 |

### 1.4 目录结构要求
```
etf-app/                    ← Vercel 部署根目录
├── index.html              ← 前端入口
├── manifest.json           ← PWA 配置
├── sw.js                   ← Service Worker
├── vercel.json             ← Vercel 部署配置
├── requirements.txt        ← Python 依赖 (akshare等)
├── api/
│   └── index.py            ← Serverless Function 入口
├── css/
│   ├── style.css           ← 完整暗色主题
│   └── mobile.css          ← 移动端适配
├── js/
│   ├── app.js              ← 前端入口
│   ├── core/
│   │   ├── api.js          ← 数据层 (调用 Vercel 后端)
│   │   ├── engine.js       ← 三因子引擎 (前端降级用)
│   │   └── simulator.js    ← 模拟盘引擎
│   ├── ui/                 ← UI 组件
│   └── utils/              ← 工具函数
└── icons/                  ← PWA 图标
```

## 二、本地开发与测试

### 2.1 启动后端
```bash
cd etf-app
pip install -r requirements.txt
cd ../etf-web/backend
python server.py
# 监听 http://localhost:5000
```

### 2.2 前端开发
```bash
# 方式1: 直连本地 Flask 后端
npx http-server etf-app -p 8080 -c-1
# 前端会自动检测 localhost → 使用 http://localhost:5000/api/analysis

# 方式2: 通过 Flask 后端同时托管前后端
# 修改 server.py 中的 static_folder 指向 etf-app 目录
```

### 2.3 环境切换逻辑 (api.js)
```javascript
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5000'   // 本地开发
    : '';                        // 生产部署（同域）
```

## 三、功能模块说明

### 3.1 数据获取层 - api/index.py (Vercel后端)
```
GET /api/analysis  → 完整三因子分析 (含份额，约18秒)
GET /api/health    → 健康检查
GET /api/etfs      → ETF列表
GET /api/kline/<code> → 单只ETF K线
```

### 3.2 前端数据层 - js/core/api.js
- `doRefresh()`: 调用后端 `/api/analysis`，填充 `window.appData`
- 触发 Web 版 UI 组件渲染

### 3.3 三因子引擎 - api/index.py
```
量能因子 (50%): 成交量 / 20日均量 → vprob() → 0-100%概率
方向因子 (20%): ETF涨跌 + 沪深300走势 → dprob() → 0-100%概率
份额因子 (30%): 份额变化率 → sprob() → 0-100%概率

综合概率 cp = vp×50% + dp×20% + sp×30%
cp ≥ 70% → 🔴 高确信
cp ≥ 50% → 🟡 中等
cp < 50% → ⚪ 正常
```

### 3.4 监控的ETF (7只)
```
510300  华泰柏瑞沪深300ETF    (上交所, 沪深300)
510310  易方达沪深300ETF      (上交所, 沪深300)
510330  华夏沪深300ETF        (上交所, 沪深300)
159919  嘉实沪深300ETF        (深交所, 沪深300)
510050  华夏上证50ETF         (上交所, 上证50)
510500  华泰柏瑞中证500ETF     (上交所, 中证500)
512100  南方中证1000ETF       (上交所, 中证1000)
```

### 3.5 前端页面 (5个Tab)
| Tab | 文件 | 功能 |
|-----|------|------|
| 仪表盘 | ui/dashboard.js | 信号汇总 + 7张ETF卡片 + ECharts迷你图 |
| 详情 | ui/detail.js | 环形仪表盘 + 趋势图 + 历史数据表 |
| 历史 | ui/history.js | 热力图 + 日期浏览 + 信号详情 |
| 综合报告 | ui/report.js | 评级 + 成交量排名 + 方向一致性 + 信号回溯 |
| 模拟盘 | core/simulator.js + ui/sim_ui.js | 策略配置 + 手动交易 + 回测 + 导出 |

### 3.6 PWA 离线能力 (sw.js)
- 静态资源缓存 (index.html, css, js, icons)
- 腾讯API K线数据缓存 (2小时过期)
- 离线状态提示

## 四、故障排查

### 4.1 三因子无法触发（始终显示二因子）
```
原因: akshare 份额数据获取失败
排查:
1. 检查 Vercel 日志 → akshare 是否有报错
2. 上交所 API 非交易日不返回数据
3. 深交所 ETF 需单独处理（费用已处理）
4. akshare 版本过旧 → 更新 requirements.txt
```

### 4.2 Vercel 函数超时
```
Vercel 免费版限制 30秒执行时间
份额数据获取约18秒
如果超时:
1. 检查 vercel.json 的 maxDuration 设置
2. 减少 fetch_share_history 的 lookback 天数
3. 考虑升级到 Pro 版 (60秒)
```

### 4.3 前端报错 "后端连接失败"
```
1. 检查 api.js 第11行 API_BASE_URL 是否正确
2. 开发环境: 确认 Flask 后端已启动 (python server.py)
3. 生产环境: 确认 Vercel 部署成功，访问 Vercel 域名
4. 浏览器 Console 查看具体错误
```

### 4.4 数据为0或异常
```
1. 腾讯API → 访问 web.ifzq.gtimg.cn → 检查是否可跨域
2. akshare → 非交易日份额数据为空 → 正常现象
3. K线数据 < 22条 → 显示"数据不足"
```

## 五、扩容与迁移

### 5.1 迁移到其他平台
- **Netlify Functions**: 将 api/index.py 重写为 JS/TS 格式
- **Cloudflare Workers**: 类似，需 JS 重写
- **阿里云函数计算**: 直接部署 api/index.py

### 5.2 增加监控ETF
1. 编辑 `api/index.py` 中的 `ETFS` 字典
2. 编辑 `js/core/engine.js` 中的 `etfDefs`（前端降级引擎）
3. 同步更新 `etf-web/backend/server.py`（保留兼容）

### 5.3 调整三因子权重
```python
# api/index.py analyze_single() 函数
cp = round(vp * 0.5 + dp * 0.2 + sp * 0.3, 1)  # 修改权重
```

## 六、Git 管理建议

```
etf-monitor/
├── etf-app/          ← PWA 前端 + Vercel 后端
├── etf-web/          ← 原始 Flask 全栈版
├── etf-three-factor-v7/  ← 原始 Python 脚本
└── logs/             ← 运行日志
```

建议提交粒度:
```bash
# Vercel 后端修改 → 只推 etf-app/api/ 和 requirements.txt
# 前端 UI 修改 → 只推 etf-app/js/ 和 css/
# 全部提交 → git push 即可自动触发 Vercel 重新部署