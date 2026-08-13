# 🌱 实习德育伴 · 中职生跟岗实习随身德育伙伴

面向中职学校跟岗实习学生的德育陪伴网页应用。AI 引擎使用 **deepseek-v4-flash**（商汤日日新 Token Plan 免费额度，**每 5 小时 500 次调用**），纯前端架构，可免费部署到 **GitHub Pages**。

## ✨ 功能（对照原始方案）

| 方案模块 | 网页版实现 |
|---|---|
| 学生端 · 匿名提问「心事小纸条」 | ✅ 匿名输入，内容仅存本机浏览器，不记身份 |
| 学生端 · AI 温和引导回复 | ✅ 德育引导 Prompt（共情→梳理→建议），自动做问题分类与风险分级 |
| 学生端 · 真实案例库匹配 | ✅ 内置 16 条脱敏案例（劳资/人际/规划/诚信），支持搜索筛选 |
| 学生端 · 成长自测工具 | ✅ 10 题实习适应力自测（情绪/人际/规划/守规四维）+ AI 个性化解读 |
| 教师端 · 共性问题推送看板 | ✅ 匿名记录按分类与风险聚合统计 + AI 共性洞察 |
| 教师端 · 德育台账自动生成 | ✅ AI 汇总生成台账，可编辑、复制、打印 / 存 PDF |
| 教师端 · 预警 / 干预建议 | ✅ 三色风险分级预警 + 按等级给出动作建议 + AI 干预建议 |
| 教师端 · 数据导出（PDF / Excel） | ✅ 台账打印存 PDF、记录导出 CSV（Excel 可打开） |
| 核心引擎 · 问题分类器 | ✅ AI 结构化输出 + 前端关键词规则双重兜底 |
| 核心引擎 · 共性聚类 / 台账引擎 | ✅ 分类聚合 + AI 生成 |

## 🚀 快速使用

### 1. 获取免费 API Key（商汤 Token Plan）

1. 打开 https://platform.sensenova.cn/ ，用手机号注册登录
2. 找到「快速接入」/ Token Plan 免费申请入口，复制专属 **API Key**
3. 打开应用，点右上角 ⚙️，粘贴 Key 并保存

> 模型名固定为 `deepseek-v4-flash`，接口 `https://token.sensenova.cn/v1/chat/completions`。
> 免费额度为**滚动窗口**：每 5 小时 500 次调用。应用内会显示已用次数。

### 2. 选择调用通道

- **直连**（默认）：浏览器直接请求 token.sensenova.cn。多数网络可用；若遇跨域拦截，请切换代理。
- **代理中转**（推荐，更稳）：部署下方的 Cloudflare Worker，填入 Worker 地址即可。

### 3. 部署到 GitHub Pages

```bash
# 方式 A：用 Git 命令行
git init
git add .
git commit -m "feat: 实习德育伴网页版"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main

# 方式 B：网页操作
# 1. 在 github.com 新建空仓库（Public）
# 2. Settings → Pages → Source 选择 main 分支 / root 目录
# 3. 访问 https://<你的用户名>.github.io/<仓库名>/
```

### 4.（可选）部署 Cloudflare Worker 代理

1. 打开 https://dash.cloudflare.com/ → Workers & Pages → 创建 Worker
2. 复制 `worker/proxy.js` 全部内容粘贴进去 → 部署
3. 将得到的 `https://xxx.workers.dev` 填入应用「设置 → 代理地址」

## 📁 项目结构

```
xiyi-deyu-buddy/
├── index.html      # 页面结构
├── style.css       # 样式（响应式 / 打印样式）
├── app.js          # 全部逻辑：AI 引擎、案例库、自测、教师端聚合等
├── worker/
│   └── proxy.js    # Cloudflare Worker 代理（绕过跨域）
└── README.md
```

## 🔒 隐私与合规说明

- **纯前端无后端**：API Key 与所有数据仅存于访问者浏览器 localStorage，GitHub Pages 只托管静态文件，不会采集任何数据。
- **脱敏**：提问记录写入时自动隐去手机号 / 身份证号；教师端展示与导出均为匿名内容，不含姓名等可识别信息。
- **教育辅助定位**：工具仅作德育辅助，不替代学校管理与专业心理干预；紧急情况请通过学校渠道或拨打 **12355** 青少年服务热线。
- 正式用于真实教学场景时，建议在受控后端环境下部署，并接入学校数据安全制度。

## ⚖️ 免责声明

本工具展示的"真实案例"均为脱敏改编的演示素材，仅用于引导学生自我觉察与教师工作参考。AI 回复可能存在偏差，重要判断请以学校规定与专业人员意见为准。
