#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ETF代码与名称验证工具
从腾讯财经API获取ETF的官方名称，与当前配置对比
"""

import urllib.request
import ssl
import sys

# 设置stdout编码
sys.stdout.reconfigure(encoding='utf-8')

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

# 要验证的ETF代码（当前配置）
ETFS = {
    '510300': '华泰柏瑞沪深300ETF',
    '510310': '易方达沪深300ETF',
    '510330': '华夏沪深300ETF',
    '159919': '嘉实沪深300ETF',
    '510050': '华夏上证50ETF',
    '510500': '华泰柏瑞中证500ETF',
    '512100': '南方中证1000ETF',
}

print('=' * 70)
print('ETF代码与名称验证工具')
print('=' * 70)
print()
print('正在从腾讯财经API获取ETF信息...')
print()

mismatches = []

for code, current_name in ETFS.items():
    # 判断交易所
    if code.startswith('159') or code.startswith('16'):
        pfx = 'sz'
        exchange = '深交所(SZ)'
    else:
        pfx = 'sh'
        exchange = '上交所(SH)'
    
    # 获取ETF基本信息
    url = f'http://qt.gtimg.cn/q={pfx}{code}'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10, context=ssl_ctx) as resp:
            data = resp.read().decode('gbk')
        
        # 解析返回数据
        # 格式: v_sz159919=...~ETF名称~...
        if '~' in data:
            parts = data.split('~')
            if len(parts) > 2:
                api_name = parts[1]
                # 腾讯API返回格式: "沪深300ETF华泰柏瑞"，我们配置的是 "华泰柏瑞沪深300ETF"
                # 需要判断名称是否包含相同的关键词
                match = (current_name in api_name) or (api_name in current_name)
                status = '[OK] 匹配' if match else '[X] 不匹配!'
                
                print(f'代码: {code}')
                print(f'  当前配置: {current_name}')
                print(f'  API返回:  {api_name}')
                print(f'  交易所:   {exchange}')
                print(f'  状态:     {status}')
                print('-' * 70)
                
                if not match:
                    mismatches.append({
                        'code': code,
                        'current': current_name,
                        'api': api_name,
                        'exchange': exchange
                    })
            else:
                print(f'代码: {code} - 解析失败')
        else:
            print(f'代码: {code} - 无数据返回')
    except Exception as e:
        print(f'代码: {code} - 请求失败: {e}')

print()
print('=' * 70)
if mismatches:
    print(f'发现 {len(mismatches)} 处不匹配，请修改 etf-app/api/index.py:')
    print()
    for m in mismatches:
        print(f'  {m["code"]}: "{m["current"]}" -> 应为 "{m["api"]}" ({m["exchange"]})')
else:
    print('所有ETF名称验证通过！')
print('=' * 70)
