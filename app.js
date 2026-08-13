"use strict";
/* ============================================================
   实习德育伴 · 中职生跟岗实习随身德育伙伴（网页版）
   引擎：deepseek-v4-flash（商汤 Token Plan，每 5 小时 500 次）
   架构：纯前端，数据存 localStorage，AI 走直连/代理双通道
   ============================================================ */

/* ---------------- 工具 ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove("show"), ms);
}

/* ---------------- 存储 ---------------- */
const Store = {
  get(k, def) {
    try {
      const v = localStorage.getItem("dyb_" + k);
      return v == null ? def : JSON.parse(v);
    } catch (e) { return def; }
  },
  set(k, v) { localStorage.setItem("dyb_" + k, JSON.stringify(v)); },
  del(k) { localStorage.removeItem("dyb_" + k); },
};

/* ---------------- 设置 ---------------- */
const Settings = {
  get() {
    return {
      apiKey: Store.get("apiKey", ""),
      mode: Store.get("mode", "direct"),
      proxyUrl: Store.get("proxyUrl", "").replace(/\/+$/, ""),
      temp: Store.get("temp", 0.7),
    };
  },
  save(s) {
    Store.set("apiKey", s.apiKey || "");
    Store.set("mode", s.mode || "direct");
    Store.set("proxyUrl", (s.proxyUrl || "").trim().replace(/\/+$/, ""));
    Store.set("temp", Number(s.temp) || 0.7);
  },
};

/* ---------------- 调用额度统计（每 5 小时 500 次） ---------------- */
const Quota = {
  WINDOW: 5 * 3600 * 1000,
  LIMIT: 500,
  now() {
    const list = Store.get("quotaLog", []).filter(t => Date.now() - t < this.WINDOW);
    Store.set("quotaLog", list);
    return list;
  },
  used() { return this.now().length; },
  remain() { return Math.max(0, this.LIMIT - this.used()); },
  log() {
    const list = this.now();
    list.push(Date.now());
    Store.set("quotaLog", list.slice(-this.LIMIT));
  },
};

/* ---------------- AI 调用引擎 ---------------- */
const AI = {
  endpoint() {
    const s = Settings.get();
    return s.mode === "proxy"
      ? (s.proxyUrl || "https://your-worker.workers.dev") + "/v1/chat/completions"
      : "https://token.sensenova.cn/v1/chat/completions";
  },

  async chat(messages, { json = false, maxTokens = 1200 } = {}) {
    const s = Settings.get();
    if (!s.apiKey) {
      throw { kind: "nokey", msg: "请先在右上角 ⚙️ 设置中填入你的 API Key" };
    }
    if (Quota.remain() <= 0) {
      throw { kind: "quota", msg: "过去 5 小时的调用额度（500 次）已用完，请稍后再试" };
    }

    let resp;
    try {
      resp = await fetch(this.endpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + s.apiKey,
        },
        body: JSON.stringify({
          model: "deepseek-v4-flash",
          messages,
          temperature: s.temp,
          max_tokens: maxTokens,
          stream: false,
        }),
      });
    } catch (e) {
      const cfg = Settings.get();
      const hint = cfg.mode === "proxy"
        ? "请检查：① 已在 Cloudflare 部署 worker/proxy.js；② 代理地址填的是 https://xxx.workers.dev；③ 地址无多余空格或引号。"
        : "商汤接口服务端不支持浏览器跨域（CORS 预检不完善），直连模式在浏览器中必然被拦截。请按设置面板的指引部署代理后，切换为「代理中转」模式。";
      throw {
        kind: "network",
        msg: "网络请求失败：" + ((e && e.message) ? e.message : String(e)) + "。" + hint,
      };
    }

    Quota.log();

    if (!resp.ok) {
      let detail = "";
      try { detail = (await resp.json()).error?.message || ""; } catch (e) { /* ignore */ }
      if (resp.status === 401 || resp.status === 403) {
        throw { kind: "auth", msg: "API Key 无效或已过期，请到 platform.sensenova.cn 检查。" };
      }
      if (resp.status === 429) {
        throw { kind: "quota", msg: "接口限流（429）：额度可能已用完或请求过于频繁，请稍后再试。" };
      }
      throw { kind: "http", msg: `接口返回 ${resp.status}：${detail || "未知错误"}` };
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "";
    return json ? parseJsonBlock(content) : content;
  },
};

/* 从模型输出中提取 JSON（兼容 【JSON】包裹 或 末尾 {…}） */
function parseJsonBlock(text) {
  const m = text.match(/【JSON】\s*(\{[\s\S]*?\})\s*【\/JSON】/);
  if (m) {
    try { return { json: JSON.parse(m[1]), text: text.replace(/【JSON】[\s\S]*?【\/JSON】/, "").trim() }; }
    catch (e) { /* fall through */ }
  }
  const brace = text.lastIndexOf("{");
  const last = text.lastIndexOf("}");
  if (brace > -1 && last > brace) {
    try {
      const obj = JSON.parse(text.slice(brace, last + 1));
      return { json: obj, text: text.slice(0, brace).trim() };
    } catch (e) { /* fall through */ }
  }
  return { json: null, text: text.trim() };
}

/* ---------------- 德育引导 System Prompt ---------------- */
const MORAL_SYSTEM = [
  "你是「实习德育伴」的德育引导导师，面向中职学校跟岗实习学生提供情感支持与成长引导。",
  "引导原则：",
  "1. 语气温和、真诚、非评判，像一位懂学生的青年导师；先共情，再帮学生梳理问题，最后给 1-3 条具体可操作的温和建议；避免说教和空话。",
  "2. 涉及工资拖欠、工伤、试用期、被要求违规作业等权益问题：提示学生可咨询学校实习指导老师、家长，或拨打 12333（劳动保障维权热线），强调用合法途径解决，不怂恿对抗。",
  "3. 若出现自伤、自杀、极端情绪等信号：首先表达真诚关心，强调生命第一，明确建议立即联系学校心理老师、班主任或家长，可拨打 12355（青少年服务热线），给出清晰的求助路径。",
  "4. 结合真实案例库中类似情况的化解思路给出建议（劳资/人际/规划/诚信四类）。",
  "5. 回复控制在 200 字以内，口语化、温暖、使用换行分点，不使用 Markdown 标题。",
  "6. 必须输出：正文引导回复结束后，另起一行输出【JSON】{...}【/JSON】包裹的结构化信息，格式：",
  '{"category":"劳资|人际|规划|诚信|其他","risk":"low|medium|high","riskReason":"风险原因，无风险则为空字符串","adviceToTeacher":"当risk为medium或high时，给班主任的简短建议(60字内)；low则为空字符串"}',
  "7. 正文中不要出现【JSON】以外的多余标记。",
].join("\n");

/* ---------------- 内置真实案例库（脱敏改编） ---------------- */
const CaseLib = [
  // 劳资权益
  { id: "l1", cat: "劳资", title: "实习工资迟迟不发", scene: "进厂/进店实习第三周，带教师傅说工资要压到下个月，学生担心企业拖欠。", guide: "先平和地与主管核对工资发放制度；若确实拖欠，可请学校实习指导老师出面协调，必要时拨打 12333 劳动保障热线咨询，保留工时记录作为依据。" },
  { id: "l2", cat: "劳资", title: "加班没有加班费", scene: "订单旺季，企业要求实习生连续加班，周末也不休息，却没有任何补贴说明。", guide: "沟通时先表达配合态度，同时问清加班与调休/补贴安排；若企业规避责任，及时联系带队老师与学校，不独自硬扛。" },
  { id: "l3", cat: "劳资", title: "工伤受伤不知怎么处理", scene: "操作设备时手指被划伤，车间只说'小伤没事'，学生担心后续没人管。", guide: "立即上报带教师傅并做好记录；保留就医票据与现场证据，告知家长和学校，由学校协助确认是否属于工伤范畴及责任归属。" },
  { id: "l4", cat: "劳资", title: "被要求交'实习押金'", scene: "企业以'防止跑路'为由要求实习生交 500 元押金，学生心存疑虑。", guide: "任何形式的押金/变相收费都可先拒绝并保留凭证；我国法律法规对用人单位收取押金有明确限制，可向学校就业办和劳动监察部门核实。" },
  // 人际关系
  { id: "r1", cat: "人际", title: "师傅太严厉，总挨批评", scene: "带教师傅要求高，做错一点就当众批评，学生觉得委屈、想逃避上班。", guide: "理解师傅'严师'的出发点；找合适时机私下请教'哪里可以做得更好'，把批评转化为具体改进点；委屈时先记情绪日记，再决定是否找老师倾诉。" },
  { id: "r2", cat: "人际", title: "同事之间的排挤感", scene: "老员工讲话带刺，小团体明显，实习生感觉被孤立，中午吃饭都插不上话。", guide: "不急着'融入'，先做好手头事；主动参与力所能及的杂活建立信任；同时拓宽社交圈（同批实习生、学校朋友），减少对单一环境的情绪依赖。" },
  { id: "r3", cat: "人际", title: "被塞'不属于自己的活'", scene: "同事把杂活都推给实习生，学生很忙但学不到核心技术，感觉被当免费劳动力。", guide: "学技术期间'多干活'不等于被欺负，先判断是常态还是恶意；可通过师傅安排任务而非个人帮忙，适当表达'我想多学点岗位技能'的意愿。" },
  { id: "r4", cat: "人际", title: "和同组同学闹矛盾", scene: "搭档做事拖拉，考核又是小组绑定，学生觉得被拖累，关系紧张。", guide: "先私下温和沟通分工；若沟通无效，向带队老师反映问题时对事不对人；学会区分'合作问题'与'人品的否定'，不把矛盾上升为人身攻击。" },
  // 职业规划
  { id: "p1", cat: "规划", title: "实习太累，不想干了", scene: "每天站 8 小时、重复劳动，学生打退堂鼓，想直接请假或放弃。", guide: "区分'辛苦'与'不适合'：先定一个小目标（坚持到实习满 X 周）并记录每天学到的技能；把辞职决定推迟到冷静期后，再与学校老师一起评估。" },
  { id: "p2", cat: "规划", title: "觉得岗位和所学专业不对口", scene: "学的数控，却被安排去包装流水线，学生觉得实习没意义。", guide: "先确认实习目标（体验职场/掌握基础规范也是收获）；主动向师傅申请轮岗或接触核心工序；把'不对口'的困惑整理成问题清单，找专业老师分析路径。" },
  { id: "p3", cat: "规划", title: "对未来一片迷茫", scene: "不知道实习完是升学还是就业，感觉自己和别人差很远。", guide: "迷茫是正常的，不必自我否定；用一周时间列出自己的兴趣、擅长、怕什么，做一次简单的生涯探索（见成长自测）；主动找班主任或职业指导老师约谈一次。" },
  { id: "p4", cat: "规划", title: "想换一个岗位试试", scene: "刚实习两周就发现自己对当前岗位没有热情，想申请换岗。", guide: "先给岗位一个'观察期'（至少完成第一个小任务）；换岗前先了解目标岗位，通过带队老师走正规申请流程，避免擅自离岗影响实习鉴定。" },
  // 诚信守规
  { id: "d1", cat: "诚信", title: "想找人代写实习报告", scene: "实习日志和报告太多，有同学提议'网上代写'，学生有些心动。", guide: "代写属学术不诚信，一旦被查会直接影响实习鉴定与毕业，还可能被企业记录；可以请老师帮梳理'日志怎么写更高效'，学会用碎片时间记录要点。" },
  { id: "d2", cat: "诚信", title: "顺手带走企业的小物料", scene: "车间物料管理松，个别同事'拿一点没事'，学生犹豫要不要效仿。", guide: "'别人拿'不等于'你可以拿'，物料属企业财产，被发现会记入实习档案；遇到这种现象可以提醒或报告带队老师，守住职业底线比短期小利重要。" },
  { id: "d3", cat: "诚信", title: "考勤上想'睁一只眼'", scene: "同事帮忙'打卡'，学生迟到几分钟不想被记录，纠结是否配合。", guide: "考勤诚信直接影响企业对你的评价；偶尔一次可主动向主管说明并补时；'帮忙打卡'看似小事，实则是职业诚信的试金石。" },
  { id: "d4", cat: "诚信", title: "犯了错想瞒下来", scene: "操作失误造成小损失，怕被批评，想瞒着不说或嫁祸他人。", guide: "诚实坦白往往比隐瞒损失更小、更被信任；及时上报并主动提出补救方案，展示的是责任意识；犯错是成长的一部分，学校和企业都愿意给敢担当的年轻人机会。" },
];

/* ---------------- 脱敏 ---------------- */
function desensitize(text) {
  return String(text || "")
    .replace(/\d{15,18}/g, m => "*".repeat(m.length)) // 身份证号（等长掩码，先处理更长串）
    .replace(/(?<!\d)\d{11}(?!\d)/g, "138****0000");  // 手机号（两侧边界，避免误伤长串）
}

/* ---------------- 记录存储（学生端写入，教师端读取） ---------------- */
const Records = {
  all() { return Store.get("records", []); },
  save(list) { Store.set("records", list.slice(-300)); }, // 最多保留 300 条
  add(rec) {
    const list = this.all();
    list.push(Object.assign({ id: uid(), time: Date.now() }, rec));
    this.save(list);
  },
  clear() { Store.set("records", []); },
};

/* 内置脱敏示例数据（教师端演示） */
const DEMO_RECORDS = [
  { id: "demo1", time: Date.now() - 1000 * 3600 * 30, msg: "实习三周了工资还没发，问了师傅他就说等通知，心里很没底。", category: "劳资", risk: "medium" },
  { id: "demo2", time: Date.now() - 1000 * 3600 * 50, msg: "师傅总当着大家面说我笨，我都快不敢去上班了。", category: "人际", risk: "medium" },
  { id: "demo3", time: Date.now() - 1000 * 3600 * 70, msg: "每天就是重复拧螺丝，觉得实习一点意思都没有，想放弃。", category: "规划", risk: "low" },
  { id: "demo4", time: Date.now() - 1000 * 3600 * 90, msg: "有同事让我帮忙打卡，说大家都这样，我有点不知道怎么办。", category: "诚信", risk: "low" },
  { id: "demo5", time: Date.now() - 1000 * 3600 * 110, msg: "同组同学老把活推给我，我一个人干两个人的量。", category: "人际", risk: "medium" },
  { id: "demo6", time: Date.now() - 1000 * 3600 * 130, msg: "最近压力好大，晚上总失眠，有点撑不住了。", category: "其他", risk: "high" },
];

/* 风险关键词规则（前端兜底 + 预警） */
const RISK_RULES = [
  { lv: "high", words: ["想死", "自杀", "不想活", "活不下去", "自残", "伤害自己", "轻生", "撑不下去"] },
  { lv: "medium", words: ["拖欠", "不发工资", "工伤", "被骗", "辞退", "欺负", "打人", "扣工资", "押金", "罚钱", "威胁"] },
  { lv: "low", words: ["太累", "不想干", "换岗", "迷茫", "辞职", "不适应", "想回家", "没意思", "累"] },
];
function ruleRisk(msg) {
  for (const r of RISK_RULES) {
    if (r.words.some(w => (msg || "").includes(w))) return r.lv;
  }
  return "low";
}

/* ============================================================
   学生端
   ============================================================ */
const Student = {
  /* ---------- 心事小纸条 ---------- */
  async sendLetter() {
    const input = $("#letterInput");
    const text = input.value.trim();
    if (!text) { toast("先写点什么再发送吧～"); return; }
    if (Quota.remain() <= 0) { toast("过去 5 小时免费额度已用完，请稍后再试"); return; }
    input.value = "";
    const chat = $("#chatBox");

    const userDiv = elMsg("user", text);
    chat.appendChild(userDiv);
    const aiDiv = elMsg("ai", "", true);
    chat.appendChild(aiDiv);
    chat.scrollTop = chat.scrollHeight;

    const riskHint = ruleRisk(text);
    try {
      const messages = [
        { role: "system", content: MORAL_SYSTEM },
        { role: "user", content: "学生的心事：" + text },
      ];
      const { json, text: reply } = await AI.chat(messages, { json: true });

      const finalText = reply || (json ? "" : "");
      renderAiMsg(aiDiv, {
        text: finalText,
        category: json?.category || inferCat(text),
        risk: json?.risk || riskHint,
        riskReason: json?.riskReason || "",
        advice: json?.adviceToTeacher || "",
      });

      Records.add({
        msg: desensitize(text),
        category: json?.category || inferCat(text),
        risk: json?.risk || riskHint,
        aiReply: finalText,
        fromStudent: true,
      });
    } catch (e) {
      aiDiv.querySelector(".bubble").textContent = "😔 " + e.msg;
      aiDiv.querySelector(".bubble").classList.remove("loading");
      if (e.kind === "nokey") openSettings();
    }
    chat.scrollTop = chat.scrollHeight;
  },

  /* ---------- 案例库 ---------- */
  renderCases() {
    const kw = ($("#caseSearch").value || "").trim().toLowerCase();
    const cat = $("#caseFilter").value;
    const list = CaseLib.filter(c =>
      (!cat || c.cat === cat) &&
      (!kw || (c.title + c.scene + c.guide).toLowerCase().includes(kw))
    );
    const box = $("#caseList");
    if (!list.length) {
      box.innerHTML = '<div class="empty-tip">没有匹配的案例，换个关键词试试 🔍</div>';
      return;
    }
    box.innerHTML = list.map(c => `
      <div class="case-card">
        <div class="cc-top"><h3>${esc(c.title)}</h3><span class="tag tag-cat">${esc(c.cat)}</span></div>
        <p class="cc-scene">${esc(c.scene)}</p>
        <div class="cc-guide"><b>引导思路</b>：${esc(c.guide)}</div>
      </div>`).join("");
  },

  /* ---------- 成长自测 ---------- */
  quiz: [
    { dim: "情绪", q: "进入实习环境后，我经常感到紧张或焦虑", rev: true },
    { dim: "情绪", q: "实习以来，我的情绪总体保持平稳", rev: false },
    { dim: "人际", q: "我和师傅 / 带教同事的沟通比较顺畅", rev: false },
    { dim: "人际", q: "遇到困难时，我愿意主动向同事或同学求助", rev: false },
    { dim: "人际", q: "我和同组实习生相处融洽", rev: false },
    { dim: "规划", q: "我清楚自己实习要达到的学习目标", rev: false },
    { dim: "规划", q: "这份实习与我的专业方向和未来规划有关联", rev: false },
    { dim: "规划", q: "面对辛苦而重复的工作，我能理解它的价值", rev: false },
    { dim: "守规", q: "对企业规章制度，我能自觉遵守不打折扣", rev: false },
    { dim: "守规", q: "当有人想'走捷径'时，我能坚持原则不盲从", rev: false },
  ],
  quizOpts: ["很不符合", "不太符合", "一般", "比较符合", "非常符合"],

  renderQuiz() {
    const area = $("#selftestArea");
    area.innerHTML = `
      <div class="quiz-intro">本自测共 10 题，请根据实习以来的真实感受作答。结果只保存在本机，用于自我觉察。</div>
      ${Student.quiz.map((item, i) => `
        <div class="quiz-q" data-i="${i}">
          <div class="q-title">${i + 1}. ${esc(item.q)}</div>
          <div class="q-opts">${Student.quizOpts.map((o, j) =>
            `<button class="opt" data-i="${i}" data-v="${j + 1}">${o}</button>`).join("")}
          </div>
        </div>`).join("")}
      <button class="primary-btn" id="calcQuiz">查看结果</button>
      <div id="quizResult"></div>`;
  },

  calcQuiz() {
    const ans = [];
    $$(".quiz-q").forEach(q => {
      const sel = q.querySelector(".opt.selected");
      ans.push(sel ? Number(sel.dataset.v) : null);
    });
    if (ans.some(v => v == null)) { toast("还有题目没作答哦，全部答完才能看结果"); return; }

    const dims = {};
    Student.quiz.forEach((item, i) => {
      let v = ans[i];
      if (item.rev) v = 6 - v; // 反向计分
      (dims[item.dim] = dims[item.dim] || []).push(v);
    });
    const result = {};
    for (const k in dims) {
      const avg = dims[k].reduce((a, b) => a + b, 0) / dims[k].length;
      result[k] = Math.round(((avg - 1) / 4) * 100);
    }
    const overall = Math.round(Object.values(result).reduce((a, b) => a + b, 0) / Object.keys(result).length);
    const level = overall >= 75 ? "状态良好" : overall >= 60 ? "基本适应" : overall >= 40 ? "需要关注" : "明显不适应";

    const dimOrder = ["情绪", "人际", "规划", "守规"];
    $("#quizResult").innerHTML = `
      <div class="quiz-result">
        <div>综合适应指数</div>
        <div class="score">${overall}</div>
        <div class="score-desc">${level}：${levelDesc(level)}</div>
        <table>${dimOrder.map(d => {
          const v = result[d] || 0;
          return `<tr><td>${dimName(d)}</td><td style="width:55%"><div class="bar"><i style="width:${v}%"></i></div></td><td>${v}</td></tr>`;
        }).join("")}</table>
        <button class="ghost-btn" id="aiQuizAdvice">✨ 让 AI 给我个性化建议</button>
      </div>`;

    $("#aiQuizAdvice").addEventListener("click", () =>
      Student.aiQuizAdvice(result, overall));
  },

  async aiQuizAdvice(result, overall) {
    const btn = $("#aiQuizAdvice");
    btn.disabled = true;
    const dimTxt = Object.entries(result)
      .map(([k, v]) => `${dimName(k)}维度 ${v} 分`).join("，");
    try {
      const advice = await AI.chat([
        { role: "system", content: "你是中职实习指导老师，用温暖、具体、可执行的语言给出建议，120字以内，分2-3点，不使用Markdown标题。" },
        { role: "user", content: `我完成了一份实习适应力自测，综合 ${overall} 分。分项：${dimTxt}。请针对较弱维度给我个性化建议。` },
      ]);
      const box = document.createElement("div");
      box.className = "insight-box";
      box.style.marginTop = "10px";
      box.textContent = advice;
      $("#quizResult").appendChild(box);
    } catch (e) {
      toast("😔 " + e.msg);
    }
    btn.disabled = false;
  },
};

function dimName(d) {
  return { 情绪: "情绪调节", 人际: "人际关系", 规划: "职业规划", 守规: "诚信守规" }[d] || d;
}
function levelDesc(l) {
  return {
    "状态良好": "你整体适应得不错，保持下去，多积累岗位技能。",
    "基本适应": "整体还行，个别方面可以更有意识地调整。",
    "需要关注": "实习压力正在影响你，建议找老师或伙伴聊一聊，别自己扛着。",
    "明显不适应": "你可能正处在一个比较辛苦的阶段，请主动联系班主任或学校心理老师聊聊，这是对自己负责。",
  }[l];
}

/* 简单规则分类兜底（评分制：命中词数最多者胜出） */
function inferCat(text) {
  const t = text || "";
  const cats = [
    { c: "劳资", words: ["工资", "加班", "工伤", "押金", "扣钱", "拖欠", "加班费", "试用期", "辞退", "劳动", "社保"] },
    { c: "人际", words: ["师傅", "同事", "同学", "排挤", "吵架", "孤立", "相处", "欺负", "领导", "批评", "组长"] },
    { c: "规划", words: ["迷茫", "换岗", "不想干", "辞职", "放弃", "没意思", "规划", "方向", "未来", "升学", "专业不对口"] },
    { c: "诚信", words: ["代写", "打卡", "拿走", "违规", "隐瞒", "撒谎", "诚信", "抄袭", "瞒报", "造假"] },
  ];
  let best = "其他", bestN = 0;
  for (const g of cats) {
    const n = g.words.filter(w => t.includes(w)).length;
    if (n > bestN) { best = g.c; bestN = n; }
  }
  return best;
}

/* ---------- 聊天渲染 ---------- */
function elMsg(role, text, loading) {
  const div = document.createElement("div");
  div.className = "msg " + role;
  div.innerHTML = `
    <div class="avatar">${role === "ai" ? "🌱" : "🙋"}</div>
    <div class="bubble ${loading ? "loading" : ""}">${esc(text)}</div>`;
  return div;
}

function renderAiMsg(div, { text, category, risk, riskReason, advice }) {
  const bubble = div.querySelector(".bubble");
  bubble.classList.remove("loading");
  bubble.textContent = text || "嗯…让我想一想，换个方式再跟你说说？";
  const meta = document.createElement("div");
  meta.className = "msg-meta";
  meta.innerHTML = `
    <span class="tag tag-cat">分类：${esc(category || "其他")}</span>
    <span class="tag ${risk === "high" ? "tag-high" : risk === "medium" ? "tag-medium" : "tag-low"}">
      ${risk === "high" ? "🔴 需重点关注" : risk === "medium" ? "🟠 建议关注" : "🟡 状态良好"}
    </span>`;
  div.appendChild(meta);
  if (risk === "high" || risk === "medium") {
    const note = document.createElement("div");
    note.className = "risk-note";
    note.innerHTML = risk === "high"
      ? "<b>请一定照顾好自己。</b>如果你现在很难受，请立即联系学校心理老师、班主任或家人，也可以拨打 <b>12355</b>（青少年服务热线），他们都在。"
      : `建议后续与班主任或实习指导老师聊聊，及时求助不丢人。${advice ? "（给老师的小建议：" + esc(advice) + "）" : ""}`;
    div.appendChild(note);
  }
}

/* ============================================================
   教师端
   ============================================================ */
const Teacher = {
  demoLoaded: false,

  /* 取记录：真实 + 示例（示例仅演示，标注入口） */
  getRecords() {
    const real = Records.all().filter(r => r.fromStudent !== false);
    const demo = Store.get("demoLoaded", false) ? DEMO_RECORDS.map(r => Object.assign({}, r, { isDemo: true })) : [];
    return [...real, ...demo].sort((a, b) => b.time - a.time);
  },

  renderBoard() {
    const list = this.getRecords();
    const stat = { 劳资: 0, 人际: 0, 规划: 0, 诚信: 0, 其他: 0, high: 0, medium: 0, low: 0 };
    list.forEach(r => {
      if (stat[r.category] != null) stat[r.category]++;
      if (stat[r.risk] != null) stat[r.risk]++;
    });
    const total = list.length;

    $("#statCards").innerHTML = `
      <div class="stat-card"><div class="num">${total}</div><div class="lbl">累计问题</div></div>
      ${[["劳资", "劳资权益"], ["人际", "人际关系"], ["规划", "职业规划"], ["诚信", "诚信守规"], ["其他", "其他"]].map(([k, lbl]) =>
        `<div class="stat-card"><div class="num">${stat[k]}</div><div class="lbl">${lbl}</div></div>`).join("")}
      <div class="stat-card ${stat.high ? "danger" : ""}"><div class="num">${stat.high}</div><div class="lbl">🔴 高风险</div></div>
      <div class="stat-card ${stat.medium ? "warn" : ""}"><div class="num">${stat.medium}</div><div class="lbl">🟠 中风险</div></div>`;

    const groups = {};
    list.forEach(r => {
      (groups[r.category] = groups[r.category] || []).push(r);
    });
    const order = ["劳资", "人际", "规划", "诚信", "其他"];
    const box = $("#boardDetail");
    if (!total) {
      box.innerHTML = '<div class="empty-tip">暂无记录。点击「导入示例数据」可查看演示效果。</div>';
      return;
    }
    box.innerHTML = order.filter(k => groups[k]).map(k => `
      <div class="board-group">
        <h3>${catEmoji(k)} ${k}（${groups[k].length}）</h3>
        ${groups[k].map(r => `
          <div class="rec-row">
            <span class="rec-time">${fmtTime(r.time)}${r.isDemo ? " · 示例" : ""}</span>
            <span class="tag ${riskTagClass(r.risk)}">${riskLabel(r.risk)}</span>
            <div class="rec-msg">${esc(r.msg)}</div>
          </div>`).join("")}
      </div>`).join("");
  },

  async aiInsight() {
    const list = this.getRecords();
    if (!list.length) { toast("暂无记录，先导入示例数据吧"); return; }
    const btn = $("#aiInsight");
    btn.disabled = true;
    toast("AI 正在分析共性问题…");
    const summary = list.slice(0, 40).map(r =>
      `【${r.category}·${riskLabel(r.risk)}】${r.msg}`).join("\n");
    try {
      const text = await AI.chat([
        { role: "system", content: "你是中职德育班主任助手。请对学生实习匿名提问进行共性分析，输出：1) 2-3个班级共性主题及表现；2) 可能的原因；3) 建议的德育工作举措（如班会主题、个别谈话名单、学校资源对接）。150字内，用简短条目，不加标题。" },
        { role: "user", content: "以下是近期的匿名提问（已脱敏）：\n" + summary },
      ]);
      const box = document.createElement("div");
      box.className = "insight-box";
      box.innerHTML = "<b>✨ AI 共性洞察</b><br>" + esc(text).replace(/\n/g, "<br>");
      $("#boardDetail").prepend(box);
    } catch (e) { toast("😔 " + e.msg); }
    btn.disabled = false;
  },

  /* ---------- 台账 ---------- */
  filterByPeriod(list, period) {
    if (period === "week") return list.filter(r => Date.now() - r.time < 7 * 864e5);
    if (period === "month") return list.filter(r => Date.now() - r.time < 30 * 864e5);
    return list;
  },

  async genLedger() {
    const period = $("#ledgerPeriod").value;
    const list = this.filterByPeriod(this.getRecords(), period);
    if (!list.length) { toast("该周期内暂无记录"); return; }
    const btn = $("#genLedger");
    btn.disabled = true;
    toast("AI 正在生成德育台账…");

    const stat = {};
    list.forEach(r => { stat[r.category] = (stat[r.category] || 0) + 1; });
    const statLine = Object.entries(stat).map(([k, v]) => `${k}${v}条`).join("、");
    const highCount = list.filter(r => r.risk === "high").length;
    const records = list.map(r => `【${r.category}】${r.msg}`).join("\n");

    try {
      const text = await AI.chat([
        { role: "system", content: "你是中职学校实习班级德育老师。请根据匿名提问记录（已脱敏）生成一份德育工作台账，使用清晰的结构化文本，包含：\n## 台账基本信息（统计周期、问题总数、分类统计、风险等级概况）\n## 共性问题概述（2-3条）\n## 重点关注对象（仅描述问题类型，不出现任何可识别信息）\n## 已采取措施与建议（分条）\n## 下一步工作安排（分条）\n不使用表格，用标题与列表。" },
        { role: "user", content: `统计周期内共 ${list.length} 条提问，分类情况：${statLine}，高风险 ${highCount} 条。\n记录明细：\n${records}` },
      ]);
      Teacher.renderLedgerDoc(text, { period, count: list.length, statLine, highCount });
    } catch (e) { toast("😔 " + e.msg); }
    btn.disabled = false;
  },

  renderLedgerDoc(markdown, meta) {
    const out = $("#ledgerOutput");
    out.innerHTML = `
      <div class="ledger-doc" id="ledgerDoc">
        <h3>中职跟岗实习德育工作台账</h3>
        <div class="ledger-meta">生成时间：${new Date().toLocaleString("zh-CN")} · 问题 ${meta.count} 条 · 分类：${meta.statLine} · 高风险 ${meta.highCount} 条</div>
        <div class="ledger-body">${mdToHtml(markdown)}</div>
      </div>
      <div class="ledger-actions">
        <button class="ghost-btn" id="editLedger">✏️ 编辑</button>
        <button class="primary-btn" id="printLedger">🖨 打印 / 存 PDF</button>
        <button class="ghost-btn" id="copyLedger">📋 复制</button>
      </div>`;

    $("#editLedger").addEventListener("click", () => {
      const body = $(".ledger-body", out);
      const txt = document.createElement("textarea");
      txt.className = "ledger-edit";
      txt.value = body.innerText;
      body.replaceWith(txt);
      $("#editLedger").textContent = "✅ 完成编辑";
      $("#editLedger").onclick = () => {
        txt.replaceWith(mdToHtml(txt.value));
        $("#editLedger").textContent = "✏️ 编辑";
        $("#editLedger").onclick = null;
        toast("已更新");
      };
    });
    $("#printLedger").addEventListener("click", () => {
      const pa = $("#printArea");
      pa.innerHTML = $(".ledger-doc", out).outerHTML;
      pa.style.display = "block";
      window.print();
      pa.style.display = "none";
      pa.innerHTML = "";
    });
    $("#copyLedger").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText($(".ledger-body", out)?.innerText || "");
        toast("已复制到剪贴板");
      } catch (e) { toast("复制失败，请手动选择复制"); }
    });
  },

  /* ---------- 预警 ---------- */
  renderAlerts() {
    const list = this.getRecords().filter(r => r.risk !== "low");
    const box = $("#alertList");
    if (!list.length) {
      box.innerHTML = '<div class="empty-tip">当前没有需要预警的记录 👍 可导入示例数据查看预警演示。</div>';
      return;
    }
    const order = { high: 0, medium: 1 };
    const sorted = list.sort((a, b) => order[a.risk] - order[b.risk] || a.time - b.time);
    box.innerHTML = sorted.map(r => {
      const actions = {
        high: "立即联系该生（通过班级实名渠道确认身份）谈心；通知学校心理老师与家长；建议预约学校心理咨询；必要时转介 12355 青少年服务热线，并做好跟进记录。",
        medium: "班主任 3 天内安排个别谈话，了解具体情况；视情况联动实习指导老师与企业带教师傅；记录谈话要点，持续关注两周。",
        low: "在周会/班会上以匿名形式回应共性问题，提供求助渠道提示。",
      }[r.risk];
      return `
      <div class="alert-card lv-${r.risk}">
        <div class="ac-top">
          <span class="tag ${riskTagClass(r.risk)}">${riskLabel(r.risk)}</span>
          <span class="rec-time">${fmtTime(r.time)}${r.isDemo ? " · 示例" : ""}</span>
        </div>
        <div class="ac-msg">${esc(r.msg)}</div>
        <div class="ac-action"><b>建议动作</b>：${esc(actions)}</div>
      </div>`;
    }).join("");
  },

  async aiAdvice() {
    const list = this.getRecords().filter(r => r.risk !== "low");
    if (!list.length) { toast("当前没有需要预警的记录"); return; }
    const btn = $("#aiAdvice");
    btn.disabled = true;
    toast("AI 正在生成干预建议…");
    const summary = list.map(r => `【${r.risk === "high" ? "高" : "中"}·${r.category}】${r.msg}`).join("\n");
    try {
      const text = await AI.chat([
        { role: "system", content: "你是学校德育处 / 心理健康专干。基于以下脱敏预警记录，输出一份干预建议：按优先级列出 1) 需要尽快处理的个案及其沟通策略 2) 面向班级整体的预防性安排（班会/心理活动/家校沟通）3) 需要对接的资源（心理老师、企业、12355等）。200字内，分条，不用标题。" },
        { role: "user", content: summary },
      ]);
      const box = document.createElement("div");
      box.className = "insight-box";
      box.innerHTML = "<b>✨ AI 干预建议</b><br>" + esc(text).replace(/\n/g, "<br>");
      $("#alertList").prepend(box);
    } catch (e) { toast("😔 " + e.msg); }
    btn.disabled = false;
  },

  /* ---------- 导出 ---------- */
  exportCsv() {
    const list = this.getRecords();
    if (!list.length) { toast("暂无数据可导出"); return; }
    const rows = [["时间", "分类", "风险等级", "内容（脱敏）", "AI回复摘要"]];
    list.forEach(r => {
      rows.push([
        new Date(r.time).toLocaleString("zh-CN"),
        r.category || "其他",
        riskLabel(r.risk),
        (r.msg || "").replace(/[\n\r,]/g, " "),
        ((r.aiReply || "").slice(0, 60)).replace(/[\n\r,]/g, " "),
      ]);
    });
    const csv = "\ufeff" + rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "实习德育伴_提问记录_" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("CSV 已导出（可用 Excel 打开）");
  },
};

function catEmoji(c) { return { 劳资: "💰", 人际: "🤝", 规划: "🧭", 诚信: "🛡️" }[c] || "💬"; }
function riskLabel(r) {
  return { high: "🔴 高", medium: "🟠 中", low: "🟡 低" }[r] || "🟡 低";
}
function riskTagClass(r) {
  return r === "high" ? "tag-high" : r === "medium" ? "tag-medium" : "tag-low";
}
function fmtTime(t) {
  return new Date(t).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* 极简 Markdown 渲染（标题/列表/粗体/段落） */
function mdToHtml(md) {
  return md.split("\n").map(line => {
    line = esc(line).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    if (/^#{1,6}\s/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      return `<h${Math.min(level + 2, 5)}>${line.replace(/^#+\s*/, "")}</h${Math.min(level + 2, 5)}>`;
    }
    if (/^\s*[-*•]\s/.test(line)) return `<div>· ${line.replace(/^\s*[-*•]\s/, "")}</div>`;
    if (/^\s*\d+\.\s/.test(line)) return `<div>${line.replace(/^\s*(\d+\.\s)/, "$1")}</div>`;
    if (!line.trim()) return "";
    return `<p>${line}</p>`;
  }).join("");
}

/* ============================================================
   设置 / 连接测试
   ============================================================ */
function openSettings() {
  const s = Settings.get();
  $("#setApiKey").value = s.apiKey;
  $("#setMode").value = s.mode;
  $("#setProxyUrl").value = s.proxyUrl;
  $("#setTemp").value = s.temp;
  $("#tempLabel").textContent = s.temp;
  $("#proxyField").style.display = s.mode === "proxy" ? "" : "none";
  $("#testResult").textContent = "";
  $("#settingsModal").classList.add("show");
}
function closeSettings() { $("#settingsModal").classList.remove("show"); }

function saveSettings() {
  Settings.save({
    apiKey: $("#setApiKey").value.trim(),
    mode: $("#setMode").value,
    proxyUrl: $("#setProxyUrl").value.trim(),
    temp: $("#setTemp").value,
  });
  closeSettings();
  toast("设置已保存 ✔ 剩余额度约 " + Quota.remain() + "/500 次");
}

async function testConn() {
  const btn = $("#testConn");
  btn.disabled = true;
  const out = $("#testResult");
  out.className = "test-result";
  // 直接读取当前表单值（未点保存也能测到最新输入）
  const tmp = {
    apiKey: $("#setApiKey").value.trim(),
    mode: $("#setMode").value,
    proxyUrl: $("#setProxyUrl").value.trim().replace(/\/+$/, ""),
    temp: Number($("#setTemp").value) || 0.7,
  };
  if (!tmp.apiKey) { out.textContent = "请先填写 API Key"; out.classList.add("err"); btn.disabled = false; return; }
  if (tmp.mode === "proxy") {
    if (!tmp.proxyUrl) {
      out.textContent = "代理模式下请先填写代理地址（未部署？见下方 3 步部署指引）";
      out.classList.add("err"); btn.disabled = false; return;
    }
    if (/your-worker/.test(tmp.proxyUrl)) {
      out.textContent = "代理地址仍是占位符 your-worker.workers.dev！请先在 Cloudflare 部署并粘贴真实地址";
      out.classList.add("err"); btn.disabled = false; return;
    }
  }
  Settings.save(tmp);
  out.textContent = "连接中…";
  try {
    const r = await AI.chat([{ role: "user", content: "你好，请只回复两个字：正常" }]);
    out.textContent = "✅ 连接成功！模型回复：" + r.slice(0, 60);
    out.classList.add("ok");
  } catch (e) {
    out.textContent = "❌ " + e.msg;
    out.classList.add("err");
  }
  btn.disabled = false;
}

/* ============================================================
   初始化 / 事件绑定
   ============================================================ */
function bindTabs(tabsSel, onSwitch) {
  $$(tabsSel + " .seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(tabsSel + " .seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      onSwitch(btn.dataset.tab);
    });
  });
}

function init() {
  /* 身份切换 */
  $$("#roleSwitch .role-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$("#roleSwitch .role-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const role = btn.dataset.role;
      $("#studentView").classList.toggle("active", role === "student");
      $("#teacherView").classList.toggle("active", role === "teacher");
      if (role === "teacher") { Teacher.renderBoard(); Teacher.renderAlerts(); }
    });
  });

  /* 学生端 tabs */
  bindTabs("#studentTabs", tab => {
    $$("#studentView .panel").forEach(p => p.classList.remove("active"));
    $("#panel-" + tab).classList.add("active");
    if (tab === "cases") Student.renderCases();
    if (tab === "selftest") Student.renderQuiz();
  });

  /* 教师端 tabs */
  bindTabs("#teacherTabs", tab => {
    $$("#teacherView .panel").forEach(p => p.classList.remove("active"));
    $("#panel-" + tab).classList.add("active");
    if (tab === "board") Teacher.renderBoard();
    if (tab === "alert") Teacher.renderAlerts();
  });

  /* 学生端交互 */
  $("#sendLetter").addEventListener("click", () => Student.sendLetter());
  $("#letterInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); Student.sendLetter(); }
  });
  $("#caseSearch").addEventListener("input", () => Student.renderCases());
  $("#caseFilter").addEventListener("change", () => Student.renderCases());

  /* 教师端交互 */
  $("#importDemo").addEventListener("click", () => {
    Store.set("demoLoaded", true);
    toast("已导入 6 条脱敏示例数据");
    Teacher.renderBoard(); Teacher.renderAlerts();
  });
  $("#clearRecords").addEventListener("click", () => {
    if (confirm("确定清空全部提问记录与示例数据吗？（不可恢复）")) {
      Records.clear(); Store.set("demoLoaded", false);
      Teacher.renderBoard(); Teacher.renderAlerts();
      toast("已清空");
    }
  });
  $("#aiInsight").addEventListener("click", () => Teacher.aiInsight());
  $("#genLedger").addEventListener("click", () => Teacher.genLedger());
  $("#aiAdvice").addEventListener("click", () => Teacher.aiAdvice());
  $("#exportCsv").addEventListener("click", () => Teacher.exportCsv());
  $("#exportPdf").addEventListener("click", () => {
    if (!$("#ledgerDoc")) { toast("请先在「德育台账」页生成台账"); switchTeacherTab("ledger"); return; }
    const pa = $("#printArea");
    pa.innerHTML = $("#ledgerDoc").outerHTML;
    pa.style.display = "block";
    window.print();
    pa.style.display = "none";
    pa.innerHTML = "";
  });

  /* 设置 */
  $("#openSettings").addEventListener("click", openSettings);
  $$("[data-close]").forEach(b => b.addEventListener("click", closeSettings));
  $("#saveSettings").addEventListener("click", saveSettings);
  $("#testConn").addEventListener("click", testConn);
  $("#setMode").addEventListener("change", () => {
    $("#proxyField").style.display = $("#setMode").value === "proxy" ? "" : "none";
  });
  $("#setTemp").addEventListener("input", () => {
    $("#tempLabel").textContent = $("#setTemp").value;
  });
  $("#settingsModal").addEventListener("click", e => {
    if (e.target === $("#settingsModal")) closeSettings();
  });

  /* 初始渲染 */
  Student.renderCases();
  Student.renderQuiz();
  Teacher.renderBoard();
  Teacher.renderAlerts();

  /* 顶部显示额度提示 */
  updateQuotaHint();
}

function switchTeacherTab(tab) {
  $$("#teacherTabs .seg-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  $$("#teacherView .panel").forEach(p => p.classList.remove("active"));
  $("#panel-" + tab).classList.add("active");
  if (tab === "board") Teacher.renderBoard();
  if (tab === "alert") Teacher.renderAlerts();
}

function updateQuotaHint() {
  const el = document.createElement("div");
  el.style.cssText = "text-align:center;font-size:12px;color:var(--ink-3);margin-top:10px;";
  el.textContent = `💧 deepseek-v4-flash 免费额度：过去 5 小时已用 ${Quota.used()} / 500 次`;
  document.querySelector(".container").appendChild(el);
}

document.addEventListener("DOMContentLoaded", init);
