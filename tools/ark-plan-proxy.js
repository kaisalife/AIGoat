// ark-plan-proxy.js — 让 codex 能用「路径即端点」的 provider。
// codex 固定把 base_url 拼 /responses（源码 codex-api/endpoint/responses.rs
// 的 api.path = "/responses"，无配置开关）；火山 Agent Plan 的端点是
// https://ark.cn-beijing.volces.com/api/plan/v3 本身（不带 /responses）。
// 本代理监听 127.0.0.1:8788，把收到的请求原样转发到该端点（含 SSE 流式）。
//
// 用法：node ark-plan-proxy.js   （或双击 ark-plan-proxy.bat 常驻）
// codex/AIGoat 里 provider 的 base_url 填 http://127.0.0.1:8788

const http = require('http')
const { Readable } = require('stream')

const PORT = 8788
const TARGET = process.env.ARK_PLAN_TARGET || 'https://ark.cn-beijing.volces.com/api/plan/v3'

const server = http.createServer(async (req, res) => {
  // codex 只会打 /responses；带 query 时透传（鉴权参数等场景）
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  const url = TARGET + qs

  const headers = { ...req.headers }
  delete headers.host
  delete headers['content-length']

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = Buffer.concat(chunks)

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    })
    const resHeaders = {}
    upstream.headers.forEach((value, key) => {
      // hop-by-hop 头不透传，避免 Node 报错
      if (!['transfer-encoding', 'connection', 'keep-alive'].includes(key)) resHeaders[key] = value
    })
    res.writeHead(upstream.status, resHeaders)
    if (!upstream.body) {
      res.end()
      return
    }
    // SSE 流式透传：上游吐一行下游写一行，不做缓冲
    const reader = upstream.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(Buffer.from(value))
    }
    res.end()
  } catch (err) {
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { message: `ark-plan-proxy 转发失败：${err}` } }))
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[ark-plan-proxy] http://127.0.0.1:${PORT} -> ${TARGET}`)
})
