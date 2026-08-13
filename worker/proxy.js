/**
 * 实习德育伴 · Cloudflare Worker 代理
 * ---------------------------------------------------------------
 * 用途：GitHub Pages 是纯静态托管，无法提供后端。浏览器直连商汤
 *      token.sensenova.cn 时，部分网络环境会被 CORS 预检拦截。
 *      部署本 Worker 后，在应用「设置 → 调用通道 → 代理中转」中
 *      填入 Worker 地址，即可稳定调用 deepseek-v4-flash。
 * 部署：dashboard.cloudflare.com → Workers → 创建 Worker → 粘贴本文件 → 部署
 * 安全：API Key 由浏览器在请求头中携带，Worker 仅做透传，不落盘、不打日志。
 */
export default {
  async fetch(request, env, ctx) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };

    // 预检请求
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    const url = "https://token.sensenova.cn/v1/chat/completions";

    // 透传客户端请求体，仅追加模型名与必要头
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }
    body.model = body.model || "deepseek-v4-flash";

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": request.headers.get("Authorization") || "",
      },
      body: JSON.stringify(body),
    });

    const upstreamBody = await upstream.text();
    return new Response(upstreamBody, {
      status: upstream.status,
      headers: { "Content-Type": "application/json", ...cors },
    });
  },
};
