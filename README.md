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

### 2. 选择调用通道（重要）

> ⚠️ **实测结论**：商汤 `token.sensenova.cn` 的 CORS 预检（OPTIONS）返回 404 且缺少 `Access-Control-Allow-Methods / Allow-Headers` 头，浏览器发起的带 `Authorization` 请求**必然被跨域拦截**。因此**请直接使用「代理中转」模式**，不要使用直连。

- **代理中转**（✅ 推荐 / 必须）：部署下方的 Cloudflare Worker，在应用「设置 → 调用通道」选「代理中转」，填入 Worker 地址即可。免费、约 3 分钟完成。
- **直连**（❌ 不可用）：仅供无拦截的受限场景（如部分本地插件内嵌 WebView），浏览器常规环境会被 CORS 拦截。

### 3. 部署 Cloudflare Worker 代理（必须，约 3 分钟）

1. 打开 https://dash.cloudflare.com/ → 用邮箱注册/登录（免费）
2. 左侧 **Workers & Pages** → **创建** → 名称填 `deyu-proxy` → **部署**
3. 点击 **编辑代码**，把 `worker/proxy.js` 的全部内容粘贴覆盖默认代码 → 右上角 **部署**
4. 记下生成的地址，形如 `https://deyu-proxy.<你的子域>.workers.dev`
5. 打开应用 → ⚙️ 设置 → 调用通道选「代理中转」→ 把该地址填入「代理地址」→ **🔌 测试连接** 确认

> 排查：若「测试连接」报错，在设置面板点开「📘 还没部署代理？」展开的指引逐条核对。Worker 地址若填成 `your-worker.workers.dev`（未替换）会连到不存在的域名而失败。

### 4. 部署到 GitHub Pages

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
