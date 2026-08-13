/**
 * 实习德育伴 · Cloudflare Worker 代理
 * ---------------------------------------------------------------
 * 用途：GitHub Pages 是纯静态托管，无法提供后端。默认「直连」模式
 *      直接请求 api.deepseek.com（官方支持浏览器跨域），绝大多数情况可用。
 *      仅当直连异常（如网络环境限制）时，部署本 Worker 作为兜底通道：
 *      在应用「设置 → 调用通道 → 代理中转」填入 Worker 地址即可。
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

    const url = "https://api.deepseek.com/v1/chat/completions";

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
