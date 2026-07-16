import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Table,

  Button,
  Grid,
  message,
  Spin,
  Breadcrumb,
  Typography,
} from 'antd'
import {
  PlayCircleOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

import api from '../../api/client'
import type { ApiResponse } from '../../types/api'

const { Text } = Typography
const { useBreakpoint } = Grid

interface ChapterData {
  id: number
  name: string
  question_count: number
  accuracy_rate: number | null
  wrong_count: number
  open_at: string | null
  is_open: boolean
}

export default function ChaptersPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const screens = useBreakpoint()
  const isMobile = !screens.sm

  const [chapters, setChapters] = useState<ChapterData[]>([])
  const [courseName, setCourseName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const chaptersRes = await api.get<never, ApiResponse<ChapterData[]>>(`/courses/${courseId}/chapters`)
        if (chaptersRes.data) setChapters(chaptersRes.data)

        try {
          const courseRes = await api.get<never, ApiResponse<{ name: string }>>(`/courses/${courseId}`)
          if (courseRes.data) setCourseName(courseRes.data.name)
        } catch {
          setCourseName('课程')
        }
      } catch {
        message.error('加载章节失败')
      } finally {
        setLoading(false)
      }
    }
    if (courseId) fetchData()
  }, [courseId])

  // 判断是否已作答（有提交记录：wrong_count > 0 或 accuracy_rate > 0）
  const isCompleted = (record: ChapterData) => record.wrong_count > 0 || (record.accuracy_rate !== null && record.accuracy_rate > 0)

  const columns: ColumnsType<ChapterData> = [
    {
      title: '序号',
      key: 'index',
      width: 60,
      align: 'center',
      render: (_: unknown, __: ChapterData, idx: number) => idx + 1,
    },
    {
      title: '章节名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
    {
      title: '题目数',
      dataIndex: 'question_count',
      key: 'question_count',
      width: 80,
      align: 'center',
      responsive: ['sm'],
    },
    {
      title: '正确率',
      dataIndex: 'accuracy_rate',
      key: 'accuracy_rate',
      width: 120,
      align: 'center',
      render: (rate: number | null, record: ChapterData) => {
        if (!isCompleted(record)) return <Text type="secondary">-</Text>
        const percent = Math.round(rate! * 100)
        const color = percent >= 80 ? '#52c41a' : percent >= 60 ? '#faad14' : '#ff4d4f'
        return <Text style={{ color, fontWeight: 600 }}>{percent}%</Text>
      },
    },
    {
      title: '错题数',
      dataIndex: 'wrong_count',
      key: 'wrong_count',
      width: 80,
      align: 'center',
      responsive: ['md'],
      render: (count: number, record: ChapterData) => {
        if (!isCompleted(record)) return <Text type="secondary">-</Text>
        return <Text>{count}</Text>
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      align: 'center',
      render: (_: unknown, record: ChapterData) => {
        if (isCompleted(record)) {
          return (
            <Button type="link" size="small" icon={<EyeOutlined />}
              onClick={() => navigate(`/courses/${courseId}/sections/${record.id}`)}>
              查看
            </Button>
          )
        }
        return (
          <Button type="link" size="small" icon={<PlayCircleOutlined />}
            onClick={() => navigate(`/courses/${courseId}/sections/${record.id}`)}>
            开始答题
          </Button>
        )
      },
    },
  ]

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 100 }}><Spin size="large" /></div>
  }

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: '全部课程', onClick: () => navigate('/courses') },
          { title: courseName },
        ]}
      />

      <Table<ChapterData>
        rowKey="id"
        columns={columns}
        dataSource={chapters}
        pagination={false}
        size={isMobile ? 'small' : 'middle'}
        scroll={isMobile ? { x: 480 } : undefined}
      />
    </div>
  )
}
