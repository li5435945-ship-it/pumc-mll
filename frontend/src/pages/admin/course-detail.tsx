import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Typography,
  Tag,
  Table,
  Button,
  Space,
  Tabs,
  Form,
  Input,
  Modal,
  message,
  Grid,
  Descriptions,
  Tooltip,
  Badge,
  Popconfirm,
  Spin,
} from 'antd'
import {
  ArrowLeftOutlined,
  SaveOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import ExcelUploader from '../../components/ExcelUploader'
import ChapterRAGDrawer from '../../components/ChapterRAGDrawer'
import api from '../../api/client'
import { adminApi } from '../../api/admin'
import type { ApiResponse, CourseAdmin, ChapterAdmin } from '../../types/api'

const { Title, Text } = Typography
const { TextArea } = Input
const { useBreakpoint } = Grid

export default function AdminCourseDetailPage() {
  const { id: idParam } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const screens = useBreakpoint()
  const isMobile = !screens.sm

  const courseId = Number(idParam)
  const [course, setCourse] = useState<CourseAdmin | null>(null)
  const [chapters, setChapters] = useState<ChapterAdmin[]>([])
  const [loading, setLoading] = useState(true)

  const [promptForm] = Form.useForm()
  const [savingPrompts, setSavingPrompts] = useState(false)

  // RAG drawer state
  const [ragDrawerOpen, setRagDrawerOpen] = useState(false)
  const [selectedChapter, setSelectedChapter] = useState<ChapterAdmin | null>(null)

  // Chapter creation modal state
  const [chapterModalOpen, setChapterModalOpen] = useState(false)
  const [chapterForm] = Form.useForm()
  const [chapterSaving, setChapterSaving] = useState(false)

  // Fetch course detail and chapters
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [courseRes, chaptersRes] = await Promise.all([
          api.get<never, ApiResponse<CourseAdmin>>(`/admin/courses/${courseId}`),
          api.get<never, ApiResponse<ChapterAdmin[]>>(`/admin/courses/${courseId}/chapters`),
        ])
        if (courseRes.data) {
          setCourse(courseRes.data)
          promptForm.setFieldsValue({
            prompt_review: courseRes.data.prompt_review ?? '',
            prompt_reply: courseRes.data.prompt_reply ?? '',
            prompt_recommend: courseRes.data.prompt_recommend ?? '',
          })
        }
        if (chaptersRes.data) {
          setChapters(chaptersRes.data)
        }
      } catch {
        message.error('加载课程信息失败')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [courseId, promptForm])

  // Save prompts
  const handleSavePrompts = async () => {
    try {
      const values = await promptForm.validateFields()
      setSavingPrompts(true)
      await api.put(`/admin/courses/${courseId}`, values)
      message.success('提示词配置保存成功')
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        // form validation error
      } else {
        message.error('保存提示词配置失败')
      }
    } finally {
      setSavingPrompts(false)
    }
  }

  // Delete chapter
  const handleDeleteChapter = async (chapterId: number) => {
    try {
      await api.delete(`/admin/chapters/${chapterId}`)
      message.success('章节已删除')
      setChapters((prev) => prev.filter((ch) => ch.id !== chapterId))
    } catch {
      message.error('删除失败')
    }
  }

  // Create chapter
  const handleCreateChapter = async () => {
    try {
      const values = await chapterForm.validateFields()
      setChapterSaving(true)
      const res = await adminApi.createAdminChapter(courseId, values)
      if (res.data) {
        setChapters((prev) => [...prev, res.data!])
        message.success('章节创建成功')
        setChapterModalOpen(false)
        chapterForm.resetFields()
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        // form validation error
      } else {
        message.error('创建章节失败')
      }
    } finally {
      setChapterSaving(false)
    }
  }

  // Import success callback
  const handleImportSuccess = () => {
    // Refetch chapters
    api.get<never, ApiResponse<ChapterAdmin[]>>(`/admin/courses/${courseId}/chapters`).then((res) => {
      if (res.data) setChapters(res.data)
    })
  }

  // Chapter table columns
  const chapterColumns: ColumnsType<ChapterAdmin> = [
    {
      title: '排序',
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 60,
      align: 'center',
      responsive: ['sm'],
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
      render: (count: number) => <Text strong>{count}</Text>,
    },
    {
      title: 'RAG 状态',
      key: 'rag',
      width: 180,
      align: 'center',
      responsive: ['md'],
      render: (_: unknown, record: ChapterAdmin) => (
        <Space size="small">
          <Badge status={record.rag_enabled ? 'success' : 'default'} text={record.rag_enabled ? '已启用' : '未启用'} />
          {record.rag_enabled && record.rag_chunk_count > 0 && (
            <Tooltip title={`${record.rag_doc_count} 个文档，${record.rag_chunk_count} 个分块`}>
              <Tag icon={<DatabaseOutlined />} color="blue" style={{ margin: 0 }}>{record.rag_chunk_count} chunks</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      align: 'center',
      render: (_: unknown, record: ChapterAdmin) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<DatabaseOutlined />}
            onClick={() => { setSelectedChapter(record); setRagDrawerOpen(true) }}
          >
            RAG
          </Button>
          <Popconfirm
            title="确定删除此章节?"
            description="章节下的题目也将被删除。"
            onConfirm={() => handleDeleteChapter(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // Tab items
  const tabItems = [
    {
      key: 'prompts',
      label: 'AI 提示词配置',
      children: (
        <Card>
          <Form form={promptForm} layout="vertical">
            <Form.Item
              name="prompt_review"
              label="作业点评 Prompt"
              tooltip="学生答完题后，AI 进行点评时使用的系统提示词"
            >
              <TextArea
                rows={isMobile ? 4 : 5}
                placeholder="例如：你是一位经验丰富的护理学教授，请根据学生的答题情况给出针对性的点评和建议..."
                style={{ fontFamily: 'monospace', fontSize: 13 }}
              />
            </Form.Item>

            <Form.Item
              name="prompt_reply"
              label="AI 对话 Prompt"
              tooltip="学生在 AI 对话中提问时，使用的系统提示词"
            >
              <TextArea
                rows={isMobile ? 4 : 5}
                placeholder="例如：你是一位耐心的护理学助教，请用通俗易懂的语言回答学生的问题..."
                style={{ fontFamily: 'monospace', fontSize: 13 }}
              />
            </Form.Item>

            <Form.Item
              name="prompt_recommend"
              label="推荐问题 Prompt"
              tooltip="AI 为学生推荐重点问题时使用的系统提示词"
            >
              <TextArea
                rows={isMobile ? 4 : 5}
                placeholder="例如：根据本章内容，推荐3个学生容易出错或需要重点掌握的问题..."
                style={{ fontFamily: 'monospace', fontSize: 13 }}
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
              <Button type="primary" icon={<SaveOutlined />} loading={savingPrompts} onClick={handleSavePrompts}>
                保存配置
              </Button>
            </Form.Item>
          </Form>
        </Card>
      ),
    },
    {
      key: 'chapters',
      label: `章节管理 (${chapters.length})`,
      children: (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Button icon={<PlusOutlined />} size="small" onClick={() => setChapterModalOpen(true)}>新增章节</Button>
          </div>
          <Table<ChapterAdmin>
            rowKey="id"
            columns={chapterColumns}
            dataSource={chapters}
            pagination={false}
            size={isMobile ? 'small' : 'middle'}
            scroll={isMobile ? { x: 600 } : undefined}
          />
        </Card>
      ),
    },
    {
      key: 'import',
      label: '导入题目',
      children: (
        <Card>
          <ExcelUploader courseId={courseId} onSuccess={handleImportSuccess} />
        </Card>
      ),
    },
  ]

  // Loading
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 100 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!course) {
    return (
      <div>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/courses')} style={{ marginBottom: 16 }}>返回</Button>
        <Text type="secondary">课程不存在</Text>
      </div>
    )
  }

  const totalQuestions = chapters.reduce((sum, ch) => sum + ch.question_count, 0)
  const ragEnabledCount = chapters.filter((ch) => ch.rag_enabled).length

  return (
    <div>
      <Space style={{ marginBottom: isMobile ? 12 : 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/courses')}>返回课程列表</Button>
      </Space>

      <Card style={{ marginBottom: isMobile ? 12 : 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <Title level={4} style={{ margin: 0 }}>{course.name}</Title>
          <Tag color={course.status === 'published' ? 'green' : 'default'}>
            {course.status === 'published' ? '已发布' : '草稿'}
          </Tag>
        </div>
        {course.intro && <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>{course.intro}</Text>}
        <Descriptions column={isMobile ? 1 : 3} size="small" style={{ marginTop: 16 }}>
          <Descriptions.Item label="章节数">{chapters.length}</Descriptions.Item>
          <Descriptions.Item label="总题目">{totalQuestions}</Descriptions.Item>
          <Descriptions.Item label="RAG 已启用">{ragEnabledCount}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Tabs items={tabItems} />

      {/* RAG 管理抽屉 */}
      {selectedChapter && (
        <ChapterRAGDrawer
          open={ragDrawerOpen}
          chapterId={selectedChapter.id}
          chapterName={selectedChapter.name}
          onClose={() => setRagDrawerOpen(false)}
          onSaved={() => {
            // 刷新章节列表
            api.get<never, ApiResponse<ChapterAdmin[]>>(`/admin/courses/${courseId}/chapters`).then((res) => {
              if (res.data) setChapters(res.data)
            })
          }}
        />
      )}

      {/* 新增章节弹窗 */}
      <Modal
        title="新增章节"
        open={chapterModalOpen}
        onOk={handleCreateChapter}
        onCancel={() => { setChapterModalOpen(false); chapterForm.resetFields() }}
        confirmLoading={chapterSaving}
        okText="创建"
        cancelText="取消"
        destroyOnClose
        width={isMobile ? '95%' : 420}
      >
        <Form form={chapterForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="章节名称"
            rules={[{ required: true, message: '请输入章节名称' }]}
          >
            <Input placeholder="例如：第一章 基础护理学概述" />
          </Form.Item>
          <Form.Item name="sort_order" label="排序号">
            <Input type="number" placeholder="数字越小越靠前（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
