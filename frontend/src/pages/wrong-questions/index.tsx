import { useState, useEffect, useCallback } from 'react'
import {
  Typography,
  Tag,
  Grid,
  List,
  Card,
  Spin,
  Empty,
  Pagination,
  Select,
  Space,
  Collapse,
  Skeleton,
} from 'antd'
import {
  BookOutlined,
  FilterOutlined,
} from '@ant-design/icons'
import { mistakesApi } from '../../api/mistakes'
import type {
  MistakeCourseItem,
  MistakeQuestionItem,
} from '../../api/mistakes'

const { Title, Text } = Typography
const { useBreakpoint } = Grid

export default function WrongQuestionsPage() {
  const screens = useBreakpoint()
  const isMobile = !screens.sm
  const isTablet = !screens.md

  // ── State ──
  const [courses, setCourses] = useState<MistakeCourseItem[]>([])
  const [coursesLoading, setCoursesLoading] = useState(true)
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)

  const [questions, setQuestions] = useState<MistakeQuestionItem[]>([])
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [total, setTotal] = useState(0)

  const [chapterFilter, setChapterFilter] = useState<number | undefined>(
    undefined,
  )

  // ── Derived: chapters for selected course ──
  const chapterOptions = (() => {
    const map = new Map<number, { name: string; count: number }>()
    for (const q of questions) {
      if (q.chapter_id && q.chapter_name) {
        const existing = map.get(q.chapter_id)
        if (existing) {
          existing.count += q.wrong_count
        } else {
          map.set(q.chapter_id, {
            name: q.chapter_name,
            count: q.wrong_count,
          })
        }
      }
    }
    // Also build from all loaded questions across pages -- better to use a dedicated API
    // For now, we collect chapters from the visible questions
    return Array.from(map.entries()).map(([id, { name, count }]) => ({
      value: id,
      label: `${name} (${count})`,
    }))
  })()

  // ── Fetch courses ──
  const fetchCourses = useCallback(async () => {
    setCoursesLoading(true)
    try {
      const res = await mistakesApi.getMistakeCourses()
      if (res.data) {
        setCourses(res.data)
        // Auto-select first course
        if (res.data.length > 0 && selectedCourseId === null) {
          setSelectedCourseId(res.data[0].course_id)
        }
      }
    } catch {
      // silent
    } finally {
      setCoursesLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch questions ──
  const fetchQuestions = useCallback(async () => {
    if (!selectedCourseId) return
    setQuestionsLoading(true)
    try {
      const res = await mistakesApi.getMistakes({
        course_id: selectedCourseId,
        chapter_id: chapterFilter,
        page,
        page_size: pageSize,
      })
      if (res.data) {
        setQuestions(res.data.items)
        setTotal(res.data.total)
      }
    } catch {
      // silent
    } finally {
      setQuestionsLoading(false)
    }
  }, [selectedCourseId, chapterFilter, page, pageSize])

  useEffect(() => {
    fetchCourses()
  }, [fetchCourses])

  useEffect(() => {
    setPage(1)
    setChapterFilter(undefined)
  }, [selectedCourseId])

  useEffect(() => {
    fetchQuestions()
  }, [fetchQuestions])

  // ── Helpers ──
  const buildOptionsArray = (q: MistakeQuestionItem): string[] => {
    const opts: string[] = []
    if (q.option_a) opts.push(`A. ${q.option_a}`)
    if (q.option_b) opts.push(`B. ${q.option_b}`)
    if (q.option_c) opts.push(`C. ${q.option_c}`)
    if (q.option_d) opts.push(`D. ${q.option_d}`)
    if (q.option_e) opts.push(`E. ${q.option_e}`)
    return opts
  }

  // ── Render sidebar ──
  const renderSidebar = () => (
    <div
      style={{
        width: isMobile ? '100%' : 240,
        borderRight: isMobile ? 'none' : '1px solid #f0f0f0',
        borderBottom: isMobile ? '1px solid #f0f0f0' : 'none',
        padding: isMobile ? '0 0 12px' : '0 12px 0 0',
        overflowY: 'auto',
        maxHeight: isMobile ? 'none' : 'calc(100vh - 200px)',
      }}
    >
      <Title
        level={5}
        style={{
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <BookOutlined />
        课程列表
      </Title>

      {coursesLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : courses.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无错题"
          style={{ marginTop: 40 }}
        />
      ) : (
        <List
          size="small"
          dataSource={courses}
          renderItem={(item) => (
            <List.Item
              key={item.course_id}
              onClick={() => setSelectedCourseId(item.course_id)}
              style={{
                cursor: 'pointer',
                padding: '8px 10px',
                borderRadius: 6,
                marginBottom: 4,
                background:
                  selectedCourseId === item.course_id
                    ? '#e6f7e6'
                    : 'transparent',
                border:
                  selectedCourseId === item.course_id
                    ? '1px solid #b7eb8f'
                    : '1px solid transparent',
                transition: 'all 0.2s',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                }}
              >
                <Text
                  strong={selectedCourseId === item.course_id}
                  style={{
                    fontSize: isMobile ? 14 : 13,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.course_name}
                </Text>
                <Tag
                  color="red"
                  style={{ marginLeft: 8, flexShrink: 0 }}
                >
                  {item.wrong_count}
                </Tag>
              </div>
            </List.Item>
          )}
        />
      )}
    </div>
  )

  // ── Render question card ──
  const renderQuestionCard = (q: MistakeQuestionItem) => {
    const options = buildOptionsArray(q)
    return (
      <Card
        key={q.id}
        size="small"
        style={{ marginBottom: 12 }}
        title={
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 4,
            }}
          >
            <Text
              strong
              style={{
                fontSize: isMobile ? 13 : 14,
                flex: 1,
              }}
            >
              {q.content}
            </Text>
            <Space size={4}>
              {q.chapter_name && (
                <Tag color="blue" style={{ fontSize: 11 }}>
                  {q.chapter_name}
                </Tag>
              )}
              <Tag color="red" style={{ fontSize: 11 }}>
                错 {q.wrong_count} 次
              </Tag>
            </Space>
          </div>
        }
      >
        {/* Options */}
        <div style={{ marginBottom: 12 }}>
          {options.map((opt, idx) => {
            const letter = opt.charAt(0)
            const isCorrect = letter === q.correct_answer
            return (
              <div
                key={idx}
                style={{
                  padding: '5px 10px',
                  marginBottom: 3,
                  borderRadius: 4,
                  background: isCorrect ? '#f6ffed' : 'transparent',
                  border: isCorrect
                    ? '1px solid #b7eb8f'
                    : '1px solid transparent',
                }}
              >
                <Text
                  strong={isCorrect}
                  style={{
                    color: isCorrect ? '#52c41a' : undefined,
                    fontSize: isMobile ? 13 : 14,
                  }}
                >
                  {opt}
                </Text>
                {isCorrect && (
                  <Tag
                    color="success"
                    style={{ marginLeft: 8, fontSize: 11 }}
                  >
                    正确答案
                  </Tag>
                )}
              </div>
            )
          })}
        </div>

        {/* Explanation */}
        {q.explanation && (
          <div
            style={{
              background: '#f6f6f6',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: isMobile ? 12 : 13,
            }}
          >
            <Text strong>解析：</Text>
            <Text>{q.explanation}</Text>
          </div>
        )}
      </Card>
    )
  }

  // ── Main content ──
  const renderContent = () => {
    if (!selectedCourseId) {
      return (
        <Empty
          description="请从左侧选择一个课程"
          style={{ marginTop: 80 }}
        />
      )
    }

    return (
      <div>
        {/* Filters */}
        <div
          style={{
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <FilterOutlined style={{ color: '#999' }} />
          <Select
            placeholder="按章节筛选"
            allowClear
            style={{ minWidth: 200 }}
            options={chapterOptions}
            value={chapterFilter}
            onChange={(val) => {
              setChapterFilter(val)
              setPage(1)
            }}
            size={isMobile ? 'small' : 'middle'}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            共 {total} 道错题
          </Text>
        </div>

        {/* Questions list */}
        {questionsLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin />
          </div>
        ) : questions.length === 0 ? (
          <Empty description="暂无错题" style={{ marginTop: 40 }} />
        ) : (
          <>
            {questions.map(renderQuestionCard)}

            {total > pageSize && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <Pagination
                  current={page}
                  pageSize={pageSize}
                  total={total}
                  onChange={(p) => setPage(p)}
                  size={isMobile ? 'small' : 'default'}
                  showSizeChanger={false}
                />
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ── Mobile: collapsible sidebar ──
  if (isMobile || isTablet) {
    return (
      <div>
        <Title level={4} style={{ marginBottom: 12 }}>
          错题本
        </Title>

        <Collapse
          defaultActiveKey={['courses']}
          style={{ marginBottom: 16 }}
          items={[
            {
              key: 'courses',
              label: '课程列表',
              children: renderSidebar(),
            },
          ]}
        />

        {renderContent()}
      </div>
    )
  }

  // ── Desktop: side-by-side layout ──
  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        错题本
      </Title>

      <div style={{ display: 'flex', gap: 20 }}>
        {renderSidebar()}
        <div style={{ flex: 1, minWidth: 0 }}>{renderContent()}</div>
      </div>
    </div>
  )
}
