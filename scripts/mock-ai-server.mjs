/**
 * 本地演示用「假 AI」服务器：模拟 OpenAI 兼容接口（流式）。
 * 用途：不配置真实 API 密钥也能体验 AI 学习台 / 学习规划 / 智能录题的完整流程。
 * 启动：node scripts/mock-ai-server.mjs  然后在「设置」里选择「本地演示」服务商。
 */
import http from 'node:http'

const PORT = 5179
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

const planText = () => `好的！先确认一下：你想要一个 3 天快速入门的计划，每天投入约 1 小时。如果周期不同告诉我，我马上调整。下面是计划：

## 📅 Python 三天入门计划

| 日期 | 任务 | 产出 |
|---|---|---|
| ${day(1)} | 安装 Python 与 VS Code，跑通第一个程序 | 环境就绪 |
| ${day(2)} | 学习变量、数字与字符串 | 完成课后小练习 |
| ${day(3)} | 写第一个小项目：命令行计算器 | 一个能跑的程序 |

每天完成后去「待办」里勾掉对应任务即可，我会按天给你拆好了。

<PLAN_JSON>[{"date":"${day(1)}","title":"安装 Python 与 VS Code","subject":"Python"},{"date":"${day(2)}","title":"学习变量与数据类型","subject":"Python"},{"date":"${day(3)}","title":"完成第一个小项目：计算器","subject":"Python"}]</PLAN_JSON>`

const summaryText = () => `<TITLE>力与运动</TITLE>

## 第一节 力的基本概念

**问：** 什么是力？
**答：** 力是物体对物体的作用；不能脱离物体单独存在；单位是牛顿（N）。

**问：** 力的作用效果有哪些？
**答：** 1. 改变物体的运动状态；2. 改变物体的形状。

## 一页速记

- 力的作用是相互的
- 力是改变运动状态的原因，不是维持运动的原因

<CARD_JSON>[{"q":"什么是力？","a":"力是物体对物体的作用，单位牛顿(N)，不能脱离物体存在"},{"q":"力的作用效果有哪些？","a":"① 改变物体的运动状态；② 改变物体的形状"}]</CARD_JSON>`

const recordText = () => `<TITLE>力与运动</TITLE>

## 大纲脉络

1. 牛顿第一定律
2. 力与运动的关系

## 核心知识点

- **力不是维持运动的原因**，而是改变运动状态的原因
- 惯性：物体保持原有运动状态的性质

## 课后任务

完成课本第 45 页练习 1-3 题。`

const genericText = () => `你好，这是本地演示模式的回复。配置真实 API 密钥后即可获得真正的 AI 能力。`

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    return res.end()
  }
  if (req.method === 'POST' && req.url?.includes('/chat/completions')) {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      let sys = ''
      let stream = true
      try {
        const j = JSON.parse(body)
        sys = j?.messages?.[0]?.content ?? ''
        stream = j?.stream !== false
      } catch {
        /* 用默认回复 */
      }
      const text = sys.includes('规划师') ? planText() : sys.includes('背诵整理') ? summaryText() : sys.includes('课堂笔记') ? recordText() : genericText()

      if (!stream) {
        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ choices: [{ message: { content: text } }] }))
      }

      res.writeHead(200, { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      const chars = Array.from(text)
      const chunks = []
      for (let i = 0; i < chars.length; i += 24) chunks.push(chars.slice(i, i + 24).join(''))
      let i = 0
      const timer = setInterval(() => {
        if (i >= chunks.length) {
          clearInterval(timer)
          res.write('data: [DONE]\n\n')
          return res.end()
        }
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunks[i++] } }] })}\n\n`)
      }, 12)
      req.on('close', () => clearInterval(timer))
    })
    return
  }
  res.writeHead(404, CORS)
  res.end()
})

server.listen(PORT, () => console.log(`Mock AI server: http://localhost:${PORT}/v1`))
