import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Typography,
  Card,
  Input,
  Button,
  Skeleton,
  Tag,
  Space,
  Grid,
  Spin,
  message,
  Statistic,
  Divider,
} from 'antd'
import {
  SendOutlined,
  CloseOutlined,
  RobotOutlined,
  UserOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import { aiApi } from '../../api/ai'
import type { ChatMessage } from '../../api/ai'
import { renderMarkdown } from '../../utils/markdown'

const { Text } = Typography
const { useBreakpoint } = Grid

// ---------- Types ----------

interface AIChatPanelProps {
  open: boolean
  chapterId: number
  onClose: () => void
  embedded?: boolean
  /** 提交后的统计信息 */
  summary?: {
    accuracy_rate: number
    duration_seconds: number
    total_questions: number
    correct_count: number
    wrong_count: number
  } | null
  /** 已保存的 AI 点评（查看模式使用） */
  savedReview?: string | null
}

// ---------- Main Component ----------

export default function AIChatPanel({ open, chapterId, onClose, embedded, summary, savedReview }: AIChatPanelProps) {
  const screens = useBreakpoint()
  const isMobile = !screens.sm

  // Review state
  const [reviewText, setReviewText] = useState<string | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)

  // Recommend state
  const [recommendations, setRecommendations] = useState<string[]>([])
  const [recommendLoading, setRecommendLoading] = useState(false)

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatStreaming, setChatStreaming] = useState(false)

  // Refs
  const chatListRef = useRef<HTMLDivElement>(null)
  const assistantContentRef = useRef<string>('') // Track assistant content to avoid React strict mode double-update

  const scrollToBottom = useCallback(() => {
    if (chatListRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight
    }
  }, [])

  // Fetch review
  const fetchReview = useCallback(async () => {
    setReviewLoading(true)
    setReviewText(null)
    try {
      const res = await aiApi.postReview(chapterId)
      if (res.data) setReviewText(res.data.review)
    } catch {
      message.error('获取点评失败')
    } finally {
      setReviewLoading(false)
    }
  }, [chapterId])

  // Fetch recommendations
  const fetchRecommend = useCallback(async () => {
    setRecommendLoading(true)
    setRecommendations([])
    try {
      const res = await aiApi.postRecommend(chapterId)
      if (res.data) setRecommendations(res.data.questions)
    } catch {
      message.error('获取推荐问题失败')
    } finally {
      setRecommendLoading(false)
    }
  }, [chapterId])

  // Fetch chat history
  const fetchHistory = useCallback(async () => {
    try {
      const res = await aiApi.getHistory(chapterId)
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        setChatMessages(res.data)
      }
    } catch {
      // Silently fail - history is optional
    }
  }, [chapterId])

  // Load data when panel opens
  useEffect(() => {
    if (!open) return
    // If we have a saved review, use it directly
    if (savedReview) {
      setReviewText(savedReview)
      setReviewLoading(false)
    } else {
      fetchReview()
    }
    fetchRecommend()
    fetchHistory() // Load chat history
  }, [open, fetchReview, fetchRecommend, fetchHistory, savedReview])

  // Auto-scroll when chat messages change
  useEffect(() => {
    scrollToBottom()
  }, [chatMessages, scrollToBottom])

  // Send a message to AI
  const handleSendDirect = async (text: string) => {
    if (!text.trim() || chatStreaming) return

    const userMsg: ChatMessage = { role: 'user', content: text }
    setChatMessages((prev) => [...prev, userMsg])
    setChatInput('')

    const assistantMsg: ChatMessage = { role: 'assistant', content: '' }
    assistantContentRef.current = '' // Reset ref
    setChatMessages((prev) => [...prev, assistantMsg])
    setChatStreaming(true)

    try {
      await aiApi.streamChat(chapterId, text, {
        onToken: (chunk) => {
          // Use ref to track content, avoid React strict mode double-update issue
          assistantContentRef.current += chunk
          const currentContent = assistantContentRef.current

          setChatMessages((prev) => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last.role === 'assistant') {
              last.content = currentContent // Set from ref, not append
            }
            return [...updated]
          })
        },
        onRagUsed: () => {},
        onDone: () => setChatStreaming(false),
        onError: () => {
          setChatStreaming(false)
          message.error('AI 回复失败')
        },
      })
    } catch {
      setChatStreaming(false)
    }
  }

  // Send from input
  const handleSend = () => {
    const text = chatInput.trim()
    if (text) handleSendDirect(text)
  }

  // Click recommended question - auto send
  const handleRecommendClick = (q: string) => {
    handleSendDirect(q)
  }

  // Filter recommendations - remove intro text
  const filteredRecommendations = recommendations.filter((q) => {
    // Remove lines that look like intro text
    if (q.startsWith('根据本章') || q.startsWith('基于') || q.startsWith('以下是')) return false
    if (q.includes('推荐') && q.includes('问题')) return false
    return true
  })

  if (!open) return null

  const accuracy = summary ? Math.round(summary.accuracy_rate * 100) : null
  const accuracyColor = accuracy !== null ? (accuracy >= 80 ? '#52c41a' : accuracy >= 60 ? '#faad14' : '#ff4d4f') : '#999'
  const avgTime = summary && summary.total_questions > 0
    ? (summary.duration_seconds / summary.total_questions).toFixed(2)
    : null

  // ---- 内容区 ----
  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ===== 顶部：作业情况总结 ===== */}
      <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 12 }}>作业情况总结</Text>

        {summary && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <Card size="small" style={{ flex: 1, textAlign: 'center', background: '#fafafa' }} bodyStyle={{ padding: '12px' }}>
              <Statistic
                title={<span style={{ fontSize: 12 }}>正确率</span>}
                value={accuracy ?? 0}
                suffix="%"
                valueStyle={{ color: accuracyColor, fontSize: 24, fontWeight: 600 }}
              />
            </Card>
            <Card size="small" style={{ flex: 1, textAlign: 'center', background: '#fafafa' }} bodyStyle={{ padding: '12px' }}>
              <Statistic
                title={<span style={{ fontSize: 12 }}>每题平均耗时</span>}
                value={avgTime ?? "0"}
                suffix="秒"
                valueStyle={{ color: '#1677ff', fontSize: 24, fontWeight: 600 }}
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </div>
        )}
      </div>

      {/* ===== 中间：可滚动内容区 ===== */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {/* AI 点评 */}
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 8, color: '#1677ff' }}>
            <RobotOutlined /> AI 点评
          </Text>
          {reviewLoading ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : reviewText ? (
            <Card size="small" style={{ background: '#fafafa', border: '1px solid #f0f0f0' }} bodyStyle={{ padding: 12 }}>
              <div style={{ fontSize: 14, lineHeight: 1.8 }}>{renderMarkdown(reviewText)}</div>
            </Card>
          ) : (
            <Text type="secondary">暂无点评</Text>
          )}
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* 推荐问题 */}
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 8, color: '#1677ff' }}>
            推荐问题
          </Text>
          {recommendLoading ? (
            <Skeleton active paragraph={{ rows: 2 }} />
          ) : filteredRecommendations.length > 0 ? (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {filteredRecommendations.map((q, idx) => (
                <Card
                  key={idx}
                  size="small"
                  hoverable
                  style={{ cursor: 'pointer', borderRadius: 8 }}
                  bodyStyle={{ padding: '8px 12px' }}
                  onClick={() => handleRecommendClick(q)}
                >
                  <Space>
                    <Tag color="blue">{idx + 1}</Tag>
                    <Text style={{ fontSize: 13 }}>{q}</Text>
                  </Space>
                </Card>
              ))}
            </Space>
          ) : (
            <Text type="secondary">暂无推荐</Text>
          )}
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* 对话历史 */}
        {chatMessages.length > 0 && (
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8, color: '#1677ff' }}>
              对话
            </Text>
            <div ref={chatListRef}>
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    marginBottom: 8,
                    gap: 8,
                    alignItems: msg.role === 'user' ? 'center' : 'flex-start',
                  }}
                >
                  {/* AI: avatar first, then bubble. User: bubble first, then avatar */}
                  {msg.role === 'user' ? (
                    <>
                      <div style={{
                        maxWidth: '80%', padding: '8px 12px', borderRadius: 12,
                        background: '#1677ff', color: '#fff',
                        fontSize: 13, lineHeight: 1.6,
                      }}>
                        {msg.content}
                      </div>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: '#1677ff', color: '#fff',
                        fontSize: 12, flexShrink: 0,
                      }}>
                        <UserOutlined />
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: '#f0f5ff', color: '#1677ff',
                        fontSize: 12, flexShrink: 0,
                      }}>
                        <RobotOutlined />
                      </div>
                      <div style={{
                        maxWidth: '80%', padding: '8px 12px', borderRadius: 12,
                        background: '#f5f5f5', color: '#333',
                        fontSize: 13, lineHeight: 1.6,
                      }}>
                        {renderMarkdown(msg.content)}
                      </div>
                    </>
                  )}
                </div>
              ))}
              {chatStreaming && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#f0f5ff', color: '#1677ff', fontSize: 12,
                  }}>
                    <RobotOutlined />
                  </div>
                  <Spin size="small" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===== 底部：固定输入框 ===== */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', background: '#fff', flexShrink: 0 }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="输入你的问题..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onPressEnter={handleSend}
            disabled={chatStreaming}
            style={{ borderRadius: '8px 0 0 8px' }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            loading={chatStreaming}
            disabled={!chatInput.trim()}
            style={{ borderRadius: '0 8px 8px 0' }}
          />
        </Space.Compact>
      </div>
    </div>
  )

  // ---- 嵌入模式 ----
  if (embedded) {
    return (
      <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }} bodyStyle={{ padding: 0, height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column' }}>
        {content}
      </Card>
    )
  }

  // ---- Mobile: 全屏 ----
  if (isMobile) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#fff', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <Text strong style={{ fontSize: 16 }}>AI 助手</Text>
          <Button type="text" icon={<CloseOutlined />} onClick={onClose} style={{ color: '#666' }} />
        </div>
        {content}
      </div>
    )
  }

  // ---- Desktop: 固定右侧面板 ----
  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, zIndex: 1000,
      background: '#fff', borderLeft: '1px solid #e8e8e8', boxShadow: '-2px 0 8px rgba(0,0,0,0.06)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <Space size={8}>
          <RobotOutlined style={{ color: '#1677ff', fontSize: 18 }} />
          <Text strong style={{ fontSize: 15 }}>AI 助手</Text>
        </Space>
        <Button type="text" icon={<CloseOutlined />} onClick={onClose} style={{ color: '#666' }} />
      </div>
      {content}
    </div>
  )
}
