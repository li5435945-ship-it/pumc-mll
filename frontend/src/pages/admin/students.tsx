import { useState, useEffect, useCallback } from 'react'
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  message,
  Space,
  Popconfirm,
  Typography,
  Grid,
  Tooltip,
  Card,
  Upload,
  Spin,
  Tag,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  UserOutlined,
  LinkOutlined,
  UploadOutlined,
  DownloadOutlined,
  TeamOutlined,
  LogoutOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { User } from '../../types/api'
import { adminApi, type CreateStudentData, type UpdateStudentData, type OnlineSession } from '../../api/admin'

const { Title, Text } = Typography
const { useBreakpoint } = Grid

export default function AdminStudentsPage() {
  const screens = useBreakpoint()
  const isMobile = !screens.sm

  const [students, setStudents] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(false)
  const [searchEmail, setSearchEmail] = useState('')

  // Add student modal
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addForm] = Form.useForm()
  const [addLoading, setAddLoading] = useState(false)

  // Edit modal
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingStudent, setEditingStudent] = useState<User | null>(null)
  const [editForm] = Form.useForm()
  const [editLoading, setEditLoading] = useState(false)

  // Import modal
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<{ created: number; skipped: Array<{ row: number; email: string; reason: string }> } | null>(null)

  // Online sessions modal
  const [sessionsModalOpen, setSessionsModalOpen] = useState(false)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [onlineSessions, setOnlineSessions] = useState<OnlineSession[]>([])

  // Fetch students
  const fetchStudents = useCallback(
    async (p = page, ps = pageSize, email = searchEmail) => {
      setLoading(true)
      try {
        const res = await adminApi.getAdminStudents({
          page: p,
          page_size: ps,
          email: email || undefined,
        })
        if (res.data) {
          setStudents(res.data.items)
          setTotal(res.data.total)
        }
      } catch {
        // API not ready
      } finally {
        setLoading(false)
      }
    },
    [page, pageSize, searchEmail],
  )

  useEffect(() => {
    fetchStudents()
  }, [fetchStudents])

  // Search
  const handleSearch = () => {
    setPage(1)
    fetchStudents(1, pageSize, searchEmail)
  }

  // Add student
  const handleAdd = () => {
    addForm.resetFields()
    setAddModalOpen(true)
  }

  const handleAddOk = async () => {
    try {
      const values = await addForm.validateFields()
      setAddLoading(true)
      await adminApi.createAdminStudent(values as CreateStudentData)
      message.success('学生账号创建成功')
      setAddModalOpen(false)
      fetchStudents()
    } catch {
      // validation or API error
    } finally {
      setAddLoading(false)
    }
  }

  // Edit student
  const handleEdit = (student: User) => {
    setEditingStudent(student)
    editForm.resetFields()
    editForm.setFieldsValue({ nickname: student.nickname ?? '' })
    setEditModalOpen(true)
  }

  const handleEditOk = async () => {
    try {
      const values = await editForm.validateFields()
      setEditLoading(true)
      const data: UpdateStudentData = {}
      if (values.nickname !== undefined) data.nickname = values.nickname
      if (values.password) data.password = values.password
      await adminApi.updateAdminStudent(editingStudent!.id, data)
      message.success('更新成功')
      setEditModalOpen(false)
      fetchStudents()
    } catch {
      // validation or API error
    } finally {
      setEditLoading(false)
    }
  }

  // Delete student
  const handleDelete = async (id: number) => {
    try {
      await adminApi.deleteAdminStudent(id)
      message.success('删除成功')
      fetchStudents()
    } catch {
      message.error('删除学生失败')
    }
  }

  // Import students from Excel
  const handleImport = () => {
    setImportResult(null)
    setImportModalOpen(true)
  }

  const handleImportUpload = async (file: File) => {
    setImportLoading(true)
    setImportResult(null)
    try {
      const res = await adminApi.importStudents(file)
      if (res.data) {
        setImportResult(res.data)
        message.success(`导入完成: 成功 ${res.data.created} 名学生`)
        fetchStudents()
      }
    } catch {
      message.error('导入失败')
    } finally {
      setImportLoading(false)
    }
    return false // prevent default upload behavior
  }

  const handleDownloadTemplate = async () => {
    try {
      const res = await adminApi.downloadStudentTemplate()
      const url = window.URL.createObjectURL(new Blob([res.data as BlobPart]))
      const a = document.createElement('a')
      a.href = url
      a.download = '学生导入模板.xlsx'
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      message.error('下载模板失败')
    }
  }

  // Copy login link
  const handleCopyLoginLink = (email: string) => {
    const url = `${window.location.origin}/login?email=${encodeURIComponent(email)}`
    navigator.clipboard
      .writeText(url)
      .then(() => message.success('登录链接已复制'))
      .catch(() => message.error('复制失败'))
  }

  // Online sessions
  const fetchOnlineSessions = async () => {
    setSessionsLoading(true)
    try {
      const res = await adminApi.getOnlineSessions()
      if (res.data) {
        setOnlineSessions(res.data.sessions)
      }
    } catch {
      message.error('获取在线用户失败')
    } finally {
      setSessionsLoading(false)
    }
  }

  const handleOpenSessions = () => {
    setSessionsModalOpen(true)
    fetchOnlineSessions()
  }

  const handleKickUser = async (userId: number) => {
    try {
      await adminApi.kickUserSession(userId)
      message.success(`用户 ${userId} 已被踢下线`)
      fetchOnlineSessions()
    } catch {
      message.error('踢人失败')
    }
  }

  // Table columns
  const columns: ColumnsType<User> = [
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      ellipsis: true,
    },
    {
      title: '昵称',
      dataIndex: 'nickname',
      key: 'nickname',
      width: 120,
      render: (nickname: string | null) => nickname || '-',
    },
    {
      title: '分组',
      dataIndex: 'student_group',
      key: 'student_group',
      width: 80,
      align: 'center',
      render: (group: string | null) => group ? <Tag color="blue">{group}</Tag> : '-',
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: isMobile ? 100 : 160,
      render: (val: string | undefined) =>
        val ? new Date(val).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: isMobile ? 100 : 260,
      align: 'center',
      render: (_: unknown, record: User) => (
        <Space size="small">
          <Tooltip title="复制登录链接">
            <Button
              type="link"
              size="small"
              icon={<LinkOutlined />}
              onClick={() => handleCopyLoginLink(record.email)}
            >
              {isMobile ? '' : '登录链接'}
            </Button>
          </Tooltip>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            {isMobile ? '' : '编辑'}
          </Button>
          <Popconfirm
            title="确定删除此学生?"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              {isMobile ? '' : '删除'}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <Title level={4} style={{ margin: 0 }}>
          <UserOutlined style={{ marginRight: 8 }} />
          学生管理
        </Title>
        <Space>
          <Button icon={<TeamOutlined />} onClick={handleOpenSessions}>
            在线用户
          </Button>
          <Button icon={<UploadOutlined />} onClick={handleImport}>
            导入学生
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加学生
          </Button>
        </Space>
      </div>

      {/* Login URL hint */}
      <Card size="small" style={{ marginBottom: 16, background: '#f6ffed', borderColor: '#b7eb8f' }}>
        <Space>
          <LinkOutlined />
          <Text>学生登录地址：</Text>
          <Text copyable strong>{window.location.origin}/login</Text>
          <Text type="secondary">（创建账号后将此地址发给学生）</Text>
        </Space>
      </Card>

      {/* Search bar */}
      <div style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="按邮箱搜索"
          allowClear
          enterButton={<SearchOutlined />}
          value={searchEmail}
          onChange={(e) => setSearchEmail(e.target.value)}
          onSearch={handleSearch}
          style={{ maxWidth: 400 }}
        />
      </div>

      {/* Students table */}
      <Table<User>
        rowKey="id"
        columns={columns}
        dataSource={students}
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 名学生`,
          onChange: (p, ps) => {
            setPage(p)
            setPageSize(ps)
          },
        }}
        size={isMobile ? 'small' : 'middle'}
        scroll={isMobile ? { x: 500 } : undefined}
      />

      {/* Add student modal */}
      <Modal
        title="添加学生"
        open={addModalOpen}
        onOk={handleAddOk}
        onCancel={() => setAddModalOpen(false)}
        confirmLoading={addLoading}
        okText="创建"
        cancelText="取消"
        destroyOnClose
        width={isMobile ? '95%' : 420}
      >
        <Form form={addForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input placeholder="student@example.com" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少 6 位' },
            ]}
          >
            <Input.Password placeholder="设置登录密码" />
          </Form.Item>
          <Form.Item name="student_group" label="分组（可选）">
            <Input placeholder="例如：A、B" />
          </Form.Item>
          <Form.Item name="nickname" label="昵称（可选）">
            <Input placeholder="学生姓名" />
          </Form.Item>
        </Form>
        <Text type="secondary" style={{ fontSize: 12 }}>
          创建后，将登录地址 {window.location.origin}/login 和账号密码发给学生即可
        </Text>
      </Modal>

      {/* Edit student modal */}
      <Modal
        title="编辑学生"
        open={editModalOpen}
        onOk={handleEditOk}
        onCancel={() => setEditModalOpen(false)}
        confirmLoading={editLoading}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={isMobile ? '95%' : 420}
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="邮箱">
            <Input value={editingStudent?.email} disabled />
          </Form.Item>
          <Form.Item name="nickname" label="昵称">
            <Input placeholder="请输入昵称" />
          </Form.Item>
          <Form.Item
            name="password"
            label="新密码"
            extra="留空则不修改密码"
            rules={[{ min: 6, message: '密码至少 6 位' }]}
          >
            <Input.Password placeholder="留空则不修改" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Import students modal */}
      <Modal
        title="批量导入学生"
        open={importModalOpen}
        onCancel={() => { setImportModalOpen(false); setImportResult(null) }}
        footer={null}
        destroyOnClose
        width={isMobile ? '95%' : 500}
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">
            上传 Excel 文件批量创建学生账号。表格格式：A列=邮箱，B列=密码，C列=姓名（可选）
          </Text>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
            下载导入模板
          </Button>
        </div>

        <Upload.Dragger
          accept=".xlsx,.xls"
          showUploadList={false}
          beforeUpload={(file) => {
            handleImportUpload(file)
            return false
          }}
          disabled={importLoading}
        >
          <p style={{ fontSize: 48, color: '#1890ff' }}>
            <UploadOutlined />
          </p>
          <p style={{ fontSize: 16 }}>点击或拖拽 Excel 文件到此处上传</p>
          <p style={{ color: '#999' }}>支持 .xlsx 和 .xls 格式</p>
        </Upload.Dragger>

        {importLoading && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Spin tip="正在导入..." />
          </div>
        )}

        {importResult && (
          <div style={{ marginTop: 16 }}>
            <Card size="small" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
              <Text strong>导入结果：</Text>
              <Text style={{ marginLeft: 8 }}>成功 {importResult.created} 名学生</Text>
            </Card>
            {importResult.skipped.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <Text type="warning">跳过 {importResult.skipped.length} 条：</Text>
                <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                  {importResult.skipped.map((item, idx) => (
                    <li key={idx}>
                      <Text type="secondary">
                        第{item.row}行 {item.email}: {item.reason}
                      </Text>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Online sessions modal */}
      <Modal
        title={
          <Space>
            <TeamOutlined />
            在线用户管理
          </Space>
        }
        open={sessionsModalOpen}
        onCancel={() => setSessionsModalOpen(false)}
        footer={null}
        destroyOnClose
        width={isMobile ? '95%' : 500}
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">
            显示当前在线的用户会话。可以踢人下线，被踢用户需要重新登录。
          </Text>
        </div>

        <Button
          icon={<TeamOutlined />}
          onClick={fetchOnlineSessions}
          loading={sessionsLoading}
          style={{ marginBottom: 16 }}
        >
          刷新
        </Button>

        {sessionsLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin tip="加载中..." />
          </div>
        ) : onlineSessions.length === 0 ? (
          <Card size="small">
            <Text type="secondary">当前没有在线用户</Text>
          </Card>
        ) : (
          <Table<OnlineSession>
            rowKey="user_id"
            dataSource={onlineSessions}
            pagination={false}
            size="small"
            columns={[
              {
                title: '用户ID',
                dataIndex: 'user_id',
                key: 'user_id',
              },
              {
                title: '操作',
                key: 'action',
                width: 100,
                align: 'center',
                render: (_: unknown, record: OnlineSession) => (
                  <Popconfirm
                    title="确定踢此用户下线？"
                    onConfirm={() => handleKickUser(record.user_id)}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Button type="link" size="small" danger icon={<LogoutOutlined />}>
                      踢下线
                    </Button>
                  </Popconfirm>
                ),
              },
            ]}
          />
        )}
      </Modal>
    </div>
  )
}
