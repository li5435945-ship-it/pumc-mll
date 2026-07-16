import { useState, useEffect } from 'react'
import {
  Table,
  Button,
  Tag,
  Modal,
  Form,
  Input,
  message,
  Space,
  Popconfirm,
  Typography,
  Grid,
  Spin,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import type { ColumnsType } from 'antd/es/table'
import api from '../../api/client'
import type { ApiResponse, CourseAdmin } from '../../types/api'

const { Title } = Typography
const { TextArea } = Input
const { useBreakpoint } = Grid

export default function AdminCoursesPage() {
  const navigate = useNavigate()
  const screens = useBreakpoint()
  const isMobile = !screens.sm

  const [courses, setCourses] = useState<CourseAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCourse, setEditingCourse] = useState<CourseAdmin | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [form] = Form.useForm()

  // Fetch courses
  const fetchCourses = async () => {
    setLoading(true)
    try {
      const res = await api.get<never, ApiResponse<CourseAdmin[]>>('/admin/courses')
      if (res.data) setCourses(res.data)
    } catch {
      message.error('加载课程列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCourses()
  }, [])

  // Add course
  const handleAdd = () => {
    setEditingCourse(null)
    form.resetFields()
    setModalOpen(true)
  }

  // Edit course
  const handleEdit = (course: CourseAdmin, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setEditingCourse(course)
    form.setFieldsValue({ name: course.name, intro: course.intro })
    setModalOpen(true)
  }

  // Save course
  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setConfirmLoading(true)

      if (editingCourse) {
        await api.put(`/admin/courses/${editingCourse.id}`, values)
        message.success('更新成功')
      } else {
        await api.post('/admin/courses', values)
        message.success('创建成功')
      }

      setModalOpen(false)
      fetchCourses()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        // form validation error — no message needed
      } else {
        message.error(editingCourse ? '更新课程失败' : '创建课程失败')
      }
    } finally {
      setConfirmLoading(false)
    }
  }

  // Delete course
  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/admin/courses/${id}`)
      message.success('删除成功')
      fetchCourses()
    } catch {
      message.error('删除失败')
    }
  }

  // Table columns
  const columns: ColumnsType<CourseAdmin> = [
    {
      title: '课程名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
    {
      title: '简介',
      dataIndex: 'intro',
      key: 'intro',
      ellipsis: true,
      responsive: ['md'],
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      align: 'center',
      render: (status: string) => (
        <Tag color={status === 'published' ? 'green' : 'default'}>
          {status === 'published' ? '已发布' : '草稿'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      align: 'center',
      render: (_: unknown, record: CourseAdmin) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={(e) => handleEdit(record, e)}>
            编辑
          </Button>
          <Popconfirm title="确定删除此课程?" onConfirm={() => handleDelete(record.id)} okText="确定" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 100 }}><Spin size="large" /></div>
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>课程管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增课程</Button>
      </div>

      <Table<CourseAdmin>
        rowKey="id"
        columns={columns}
        dataSource={courses}
        pagination={false}
        size={isMobile ? 'small' : 'middle'}
        scroll={isMobile ? { x: 480 } : undefined}
        onRow={(record) => ({
          onClick: () => navigate(`/admin/courses/${record.id}`),
          style: { cursor: 'pointer' },
        })}
      />

      <Modal
        title={editingCourse ? '编辑课程' : '新增课程'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        confirmLoading={confirmLoading}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={isMobile ? '95%' : 500}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="课程名称" rules={[{ required: true, message: '请输入课程名称' }]}>
            <Input placeholder="例如：基础护理学" />
          </Form.Item>
          <Form.Item name="intro" label="课程简介">
            <TextArea rows={3} placeholder="课程简介（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
