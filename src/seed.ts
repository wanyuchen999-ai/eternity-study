import { todayKey, daysUntil } from './lib/util'
import { getPrefix } from './lib/profileStorage'
import { useNotes } from './store/notes'
import { useVocab } from './store/vocab'
import { useQuestions, type Question } from './store/questions'
import { useExams } from './store/exams'
import { SAMPLE_WORDS } from './data/words'

const SAMPLE_QUESTIONS: Omit<Question, 'id' | 'createdAt'>[] = [
  {
    type: 'single',
    stem: '1. 下列各句中，加点成语使用不恰当的一项是（  ）',
    options: [
      { key: 'A', text: '他在辩论会上旁征博引，论述条理清晰，令人信服。' },
      { key: 'B', text: '春天的公园里，各种花朵争奇斗艳，美不胜收。' },
      { key: 'C', text: '他做题总是匆匆忙忙，答案常常差强人意，正确率很低。' },
      { key: 'D', text: '面对困难，我们不能畏缩不前，而应当迎难而上。' },
    ],
    answer: 'C',
    explanation: '「差强人意」意为大体上还能使人满意，并非「不能令人满意」，此处属望文生义。',
    subject: '示例·语文',
    source: 'manual',
  },
  {
    type: 'judge',
    stem: '2. 判断：力是维持物体运动的原因。',
    answer: '错',
    explanation: '力是改变物体运动状态的原因；由牛顿第一定律，物体的运动不需要力来维持。',
    subject: '示例·物理',
    source: 'manual',
  },
  {
    type: 'fill',
    stem: '3. 填空：________是依法治国的前提和基础，依法治国的核心是________。',
    answer: '有法可依；依宪治国',
    explanation: '依法治国的基本要求：有法可依、有法必依、执法必严、违法必究；宪法是国家的根本法。',
    subject: '示例·政治',
    source: 'manual',
  },
]

export function runSeed() {
  const flag = getPrefix() + 'eternity-seeded'
  if (localStorage.getItem(flag)) return
  localStorage.setItem(flag, '1')

  useNotes.getState().upsert({
    title: '👋 欢迎使用 Eternity 学习台',
    content: [
      '这是一个纯本地运行的学习工具，所有数据保存在你自己的浏览器里。',
      '',
      '## 快速上手',
      '',
      '1. 先到 **设置** 页配置 AI（填 API 地址和密钥），AI 学习台 / 智能录题才能工作',
      '2. **番茄钟**：专注计时自动记入统计，可以给每颗番茄贴上科目标签',
      '3. **待办**：记录作业和复习计划，支持优先级和截止日期',
      '4. **AI 学习台**：课堂录音 → 自动转写 → 整理成结构化笔记；也可以和 AI 对话生成逻辑框架',
      '5. **背单词**：内置四级示例词库，支持导入自己的词库，按艾宾浩斯遗忘曲线安排复习',
      '6. **题库**：拍照/截图上传 → AI 自动识别题目建立题库，支持刷题和错题本',
      '',
      '## 数据安全',
      '',
      '- 所有数据只存在本地浏览器，可随时在「设置 → 数据管理」导出备份',
      '- 换浏览器或清缓存前记得先导出',
    ].join('\n'),
    source: 'manual',
    tags: ['指南'],
  })

  useVocab.getState().addBank('四级高频词 · 示例', SAMPLE_WORDS)

  useQuestions.getState().addMany(SAMPLE_QUESTIONS)

  const examDate = todayKey(new Date(Date.now() + 30 * 86400000))
  if (daysUntil(examDate) > 0) useExams.getState().add('期末考试（示例，可删除）', examDate)
}
