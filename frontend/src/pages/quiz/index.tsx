import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Button,
  Statistic,
  Progress,
  Typography,
  Grid,
  Tag,
  FloatButton,
  Spin,
  message,
  Alert,
  Breadcrumb,
} from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,

  RobotOutlined,
  SendOutlined,
  ExclamationCircleOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons'
import QuestionCard from '../../components/QuestionCard'
import AIChatPanel from '../../components/AIChatPanel'
import api from '../../api/client'
import type { ApiResponse } from '../../types/api'

const { Text } = Typography
const { useBreakpoint } = Grid

interface ApiQuestion {
  id: number
  chapter_id: number
  content: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  option_e: string | null
  sort_order: number
}

interface AnswerResponse {
  is_correct: boolean
  correct_answer: string
  explanation: string
}

interface AttemptDetail {
  attempt_id: number
  chapter_id: number
  total_questions: number
  correct_count: number
  wrong_count: number
  accuracy_rate: number
  duration_seconds: number
  answers: {
    question_id: number
    content: string
    option_a: string
    option_b: string
    option_c: string
    option_d: string
    option_e: string | null
    selected_answer: string
    correct_answer: string
    is_correct: boolean
    explanation: string
  }[]
  ai_review: string | null
}

interface LocalQuestion {
  id: number
  content: string
  options: string[]
  labels: string[]
}

function toLocalQuestion(q: ApiQuestion): LocalQuestion {
  const options = [q.option_a, q.option_b, q.option_c, q.option_d, q.option_e].filter(Boolean) as string[]
  const labels = ['A', 'B', 'C', 'D', 'E'].slice(0, options.length)
  return { id: q.id, content: q.content, options, labels }
}

export default function QuizPage() {
  const { courseId, chapterId } = useParams<{ courseId: string; chapterId: string }>()
  const navigate = useNavigate()
  const screens = useBreakpoint()
  const isMobile = !screens.sm

  const [questions, setQuestions] = useState<LocalQuestion[]>([])
  const [attemptId, setAttemptId] = useState<number | null>(null)
  const [selections, setSelections] = useState<Record<number, string>>({})
  const [results, setResults] = useState<Record<number, AnswerResponse>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [summary, setSummary] = useState<{ total: number; correct: number; wrong: number; accuracy: number; duration: number } | null>(null)
  const [courseName, setCourseName] = useState('')
  const [chapterName, setChapterName] = useState('')
  const [savedReview, setSavedReview] = useState<string | null>(null)

  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [aiPanelOpen, setAiPanelOpen] = useState(false)

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => setElapsedSeconds((p) => p + 1), 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  // Load quiz
  useEffect(() => {
    const loadQuiz = async () => {
      setIsLoading(true)
      try {
        // Get course name
        try {
          const courseRes = await api.get<never, ApiResponse<{ name: string }>>(`/courses/${courseId}`)
          if (courseRes.data) setCourseName(courseRes.data.name)
        } catch { setCourseName('课程') }

        // Get chapter name
        try {
          const chaptersRes = await api.get<never, ApiResponse<{ id: number; name: string }[]>>(`/courses/${courseId}/chapters`)
          if (chaptersRes.data) {
            const ch = chaptersRes.data.find((c) => c.id === Number(chapterId))
            if (ch) setChapterName(ch.name)
          }
        } catch {}

        // Check if already has submitted attempt
        const attemptsRes = await api.get<never, ApiResponse<{ attempt_id: number; chapter_id: number; accuracy_rate: number; status: string }[]>>(`/chapters/${chapterId}/attempts`)
        const submittedAttempt = attemptsRes.data?.find((a) => a.status === 'submitted')
        if (submittedAttempt) {
          // Has previous attempt - load details
          const detailRes = await api.get<never, ApiResponse<AttemptDetail>>(`/attempts/${submittedAttempt.attempt_id}/details`)
          if (detailRes.data) {
            const detail = detailRes.data
            setSummary({
              total: detail.total_questions,
              correct: detail.correct_count,
              wrong: detail.wrong_count,
              accuracy: Math.round(detail.accuracy_rate * 100),
              duration: detail.duration_seconds,
            })
            setSavedReview(detail.ai_review)

            // Convert answers to questions format
            const qs: LocalQuestion[] = detail.answers.map((a) => ({
              id: a.question_id,
              content: a.content,
              options: [a.option_a, a.option_b, a.option_c, a.option_d, a.option_e].filter(Boolean) as string[],
              labels: ['A', 'B', 'C', 'D', 'E'],
            }))
            setQuestions(qs)

            // Set selections and results
            const sels: Record<number, string> = {}
            const res: Record<number, AnswerResponse> = {}
            detail.answers.forEach((a) => {
              sels[a.question_id] = a.selected_answer
              res[a.question_id] = {
                is_correct: a.is_correct,
                correct_answer: a.correct_answer,
                explanation: a.explanation,
              }
            })
            setSelections(sels)
            setResults(res)
            setIsFinished(true)
            setAiPanelOpen(true)
          }
        } else {
          // No attempt - start new quiz
          const attemptRes = await api.post<never, ApiResponse<{ attempt_id: number }>>(`/chapters/${chapterId}/attempts`)
          if (attemptRes.data) {
            setAttemptId(attemptRes.data.attempt_id)
            const questionsRes = await api.get<never, ApiResponse<ApiQuestion[]>>(`/attempts/${attemptRes.data.attempt_id}/questions`)
            if (questionsRes.data) {
              setQuestions(questionsRes.data.map(toLocalQuestion))
              startTimer()
            }
          }
        }
      } catch (err) {
        console.error('加载失败:', err)
        message.error('加载题目失败')
      } finally {
        setIsLoading(false)
      }
    }
    if (chapterId && courseId) loadQuiz()
    return () => stopTimer()
  }, [chapterId, courseId, startTimer, stopTimer])

  const handleSelect = (questionId: number, label: string) => {
    if (isFinished) return
    setSelections((prev) => ({ ...prev, [questionId]: label }))
  }

  const handleSubmit = async () => {
    const unanswered = questions.filter((q) => !selections[q.id])
    if (unanswered.length > 0) {
      message.warning(`还有 ${unanswered.length} 道题未作答，请完成所有题目后再提交`)
      const el = document.getElementById(`question-${unanswered[0].id}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (!attemptId) return
    setIsSubmitting(true)
    try {
      stopTimer()
      const allResults: Record<number, AnswerResponse> = {}
      for (const q of questions) {
        const res = await api.post<never, ApiResponse<AnswerResponse>>(
          `/attempts/${attemptId}/answers`,
          { question_id: q.id, selected_answer: selections[q.id] }
        )
        if (res.data) allResults[q.id] = res.data
      }
      setResults(allResults)

      const submitRes = await api.post<never, ApiResponse<{ correct_count: number; wrong_count: number; accuracy_rate: number; duration_seconds: number }>>(`/attempts/${attemptId}/submit`)
      if (submitRes.data) {
        setSummary({
          total: questions.length,
          correct: submitRes.data.correct_count,
          wrong: submitRes.data.wrong_count,
          accuracy: Math.round(submitRes.data.accuracy_rate * 100),
          duration: submitRes.data.duration_seconds,
        })
        setIsFinished(true)
        setAiPanelOpen(true)
      }
    } catch {
      message.error('提交失败')
      startTimer()
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const selectedCount = Object.keys(selections).length
  const progress = questions.length > 0 ? Math.round((selectedCount / questions.length) * 100) : 0

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}><Spin size="large" tip="正在加载..." /></div>
  }

  // ==================== 已提交 / 查看模式 ====================
  if (isFinished && summary) {
    const accuracyColor = summary.accuracy >= 80 ? '#52c41a' : summary.accuracy >= 60 ? '#faad14' : '#ff4d4f'

    return (
      <div style={{ display: 'flex', gap: 16, maxWidth: 1200, margin: '0 auto', alignItems: 'flex-start' }}>
        {/* 左侧：题目结果 */}
        <div style={{ flex: isMobile ? 1 : '0 0 65%', minWidth: 0 }}>
          <Breadcrumb
            style={{ marginBottom: 12 }}
            items={[
              { title: '全部课程', onClick: () => navigate('/courses') },
              { title: courseName || '课程', onClick: () => navigate(`/courses/${courseId}`) },
              { title: chapterName || '章节' },
            ]}
          />

          {/* 统计卡片 */}
          <Card style={{ borderRadius: 10, marginBottom: 16 }} bodyStyle={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <Statistic title="总题数" value={summary.total} valueStyle={{ fontSize: 20 }} />
              <Statistic title="正确" value={summary.correct} valueStyle={{ color: '#52c41a', fontSize: 20 }} prefix={<CheckCircleOutlined />} />
              <Statistic title="错误" value={summary.wrong} valueStyle={{ color: '#ff4d4f', fontSize: 20 }} prefix={<CloseCircleOutlined />} />
              <Statistic title="用时" value={formatTime(summary.duration)} valueStyle={{ fontSize: 20 }} prefix={<ClockCircleOutlined />} />
              <div style={{ marginLeft: 'auto' }}>
                <Progress type="circle" percent={summary.accuracy} strokeColor={accuracyColor} size={72}
                  format={(p) => <span style={{ fontSize: 18, fontWeight: 600, color: accuracyColor }}>{p}%</span>} />
              </div>
            </div>
          </Card>

          {/* 题目列表 */}
          {questions.map((q, idx) => {
            const result = results[q.id]
            const selected = selections[q.id]
            return (
              <Card key={q.id} id={`question-${q.id}`}
                style={{ borderRadius: 10, marginBottom: 12, border: result?.is_correct ? '1px solid #b7eb8f' : '1px solid #ffccc7' }}
                bodyStyle={{ padding: isMobile ? 14 : 18 }}>
                <div style={{ marginBottom: 10 }}>
                  <Tag color={result?.is_correct ? 'green' : 'red'}>{idx + 1}</Tag>
                  {result && <Tag color={result.is_correct ? 'green' : 'red'}>{result.is_correct ? '✓ 正确' : '✗ 错误'}</Tag>}
                </div>
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 14, lineHeight: 1.6 }}>{q.content}</div>
                <QuestionCard content="" options={q.options}
                  optionState={{ selected: selected ?? null, correctAnswer: result?.correct_answer ?? null, answered: true }}
                  explanation={result?.explanation} onSelect={() => {}} isMobile={isMobile} hideContent />
              </Card>
            )
          })}

          <Card style={{ borderRadius: 10, textAlign: 'center' }} bodyStyle={{ padding: 16 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/courses/${courseId}`)}>返回章节列表</Button>
          </Card>
        </div>

        {/* 右侧：AI 面板 */}
        {!isMobile && (
          <div style={{ flex: '0 0 calc(35% - 16px)', position: 'sticky', top: 72 }}>
            <AIChatPanel open={true} chapterId={Number(chapterId)} onClose={() => setAiPanelOpen(false)} embedded
              summary={{ accuracy_rate: summary.accuracy / 100, duration_seconds: summary.duration, total_questions: summary.total, correct_count: summary.correct, wrong_count: summary.wrong }}
              savedReview={savedReview} />
          </div>
        )}

        {isMobile && (
          <>
            <FloatButton icon={<RobotOutlined />} type="primary" tooltip="AI 助手" onClick={() => setAiPanelOpen(true)} style={{ right: 24, bottom: 24 }} />
            <AIChatPanel open={aiPanelOpen} chapterId={Number(chapterId)} onClose={() => setAiPanelOpen(false)}
              summary={{ accuracy_rate: summary.accuracy / 100, duration_seconds: summary.duration, total_questions: summary.total, correct_count: summary.correct, wrong_count: summary.wrong }}
              savedReview={savedReview} />
          </>
        )}
      </div>
    )
  }

  // ==================== 答题模式 ====================
  return (
    <>
      <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 80 }}>
        <Breadcrumb style={{ marginBottom: 12 }}
          items={[
            { title: '全部课程', onClick: () => navigate('/courses') },
            { title: courseName || '课程', onClick: () => navigate(`/courses/${courseId}`) },
            { title: chapterName || '章节' },
          ]} />

        <Card style={{ borderRadius: 10, marginBottom: 16, position: 'sticky', top: isMobile ? 56 : 64, zIndex: 50, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
          bodyStyle={{ padding: isMobile ? '10px 12px' : '12px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Tag color="blue" style={{ fontSize: 14, padding: '2px 10px' }}>{selectedCount} / {questions.length}</Tag>
            <Statistic title={null} value={formatTime(elapsedSeconds)} prefix={<ClockCircleOutlined style={{ color: '#1677ff' }} />}
              valueStyle={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }} />
          </div>
          <Progress percent={progress} showInfo={false} strokeColor="#1677ff" size="small" style={{ marginTop: 8 }} />
        </Card>

        {questions.map((q, idx) => {
          const selected = selections[q.id]
          return (
            <Card key={q.id} id={`question-${q.id}`}
              style={{ borderRadius: 10, marginBottom: 12, border: selected ? '1px solid #91caff' : '1px solid #f0f0f0' }}
              bodyStyle={{ padding: isMobile ? 14 : 18 }}>
              <Tag color={selected ? 'blue' : 'default'} style={{ marginBottom: 10 }}>第 {idx + 1} 题</Tag>
              <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 14, lineHeight: 1.6 }}>{q.content}</div>
              <QuestionCard content="" options={q.options}
                optionState={{ selected: selected ?? null, correctAnswer: null, answered: false }}
                onSelect={(label) => handleSelect(q.id, label)} isMobile={isMobile} hideContent />
            </Card>
          )
        })}

        <Card style={{ borderRadius: 10, textAlign: 'center' }} bodyStyle={{ padding: 20 }}>
          {selectedCount < questions.length && (
            <Alert message={`还有 ${questions.length - selectedCount} 道题未作答`} type="warning" showIcon icon={<ExclamationCircleOutlined />}
              style={{ marginBottom: 12, textAlign: 'left' }} />
          )}
          <Button type="primary" size="large" icon={<SendOutlined />} onClick={handleSubmit} loading={isSubmitting} disabled={selectedCount === 0}
            style={{ minWidth: 200, height: 48, fontSize: 16 }}>
            提交答案
          </Button>
          <div style={{ marginTop: 8 }}><Text type="secondary" style={{ fontSize: 12 }}>已选 {selectedCount}/{questions.length} 题</Text></div>
        </Card>
      </div>
    </>
  )
}
