import { useEffect, useState } from 'react'
import {
  Card,
  Form,
  Input,
  Button,
  Avatar,
  Upload,
  Tag,
  message,
  Typography,
  Spin,
  Space,
} from 'antd'
import { UserOutlined, UploadOutlined } from '@ant-design/icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { UploadProps } from 'antd'
import { useAuthStore } from '../../stores/authStore'
import { profileApi, type ProfileUpdateData } from '../../api/profile'

const { Title } = Typography

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const setAuth = useAuthStore((s) => s.setAuth)
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()

  const [form] = Form.useForm()
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(
    user?.avatar_url ?? undefined,
  )
  const [uploading, setUploading] = useState(false)

  /* Keep form in sync when user loads */
  useEffect(() => {
    if (user) {
      form.setFieldsValue({ nickname: user.nickname ?? '' })
      setAvatarUrl(user.avatar_url ?? undefined)
    }
  }, [user, form])

  /* ---------- Upload avatar ---------- */
  const handleUpload: UploadProps['customRequest'] = async (options) => {
    const { file, onSuccess, onError } = options
    setUploading(true)
    try {
      const res = await profileApi.uploadAvatar(file as File)
      const url = res.data?.url
      if (url) {
        setAvatarUrl(url)
        /* Persist avatar_url to backend */
        const profileRes = await profileApi.updateProfile({ avatar_url: url })
        if (profileRes.data && token) {
          setAuth(token, profileRes.data)
        }
      }
      onSuccess?.(res)
      message.success('头像上传成功')
    } catch {
      onError?.(new Error('上传失败'))
      message.error('头像上传失败')
    } finally {
      setUploading(false)
    }
  }

  const beforeUpload = (file: File) => {
    const isImage = file.type.startsWith('image/')
    if (!isImage) {
      message.error('只能上传图片文件')
    }
    const isLt2M = file.size / 1024 / 1024 < 2
    if (!isLt2M) {
      message.error('图片大小不能超过 2MB')
    }
    return isImage && isLt2M
  }

  /* ---------- Save profile ---------- */
  const saveMutation = useMutation({
    mutationFn: (data: ProfileUpdateData) => profileApi.updateProfile(data),
    onSuccess: (res) => {
      if (res.data && token) {
        setAuth(token, res.data)
        queryClient.invalidateQueries({ queryKey: ['me'] })
      }
      message.success('保存成功')
    },
    onError: () => {
      message.error('保存失败，请重试')
    },
  })

  const onFinish = (values: { nickname: string }) => {
    saveMutation.mutate({ nickname: values.nickname })
  }

  /* ---------- Render ---------- */
  if (!user) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  const roleLabel = user.role === 'admin' ? '管理员' : '学员'
  const roleColor = user.role === 'admin' ? 'red' : 'green'

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: 480,
          borderRadius: 8,
        }}
      >
        <Title level={4} style={{ textAlign: 'center', marginBottom: 32 }}>
          个人中心
        </Title>

        {/* Avatar */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Space direction="vertical" align="center" size={12}>
            <Spin spinning={uploading}>
              <Avatar
                size={96}
                src={avatarUrl}
                icon={<UserOutlined />}
                style={{ backgroundColor: '#1a5c3a' }}
              />
            </Spin>
            <Upload
              showUploadList={false}
              customRequest={handleUpload}
              beforeUpload={beforeUpload}
              accept="image/*"
            >
              <Button icon={<UploadOutlined />} size="small">
                更换头像
              </Button>
            </Upload>
          </Space>
        </div>

        {/* Form */}
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ nickname: user.nickname ?? '' }}
        >
          <Form.Item label="昵称" name="nickname">
            <Input placeholder="请输入昵称" maxLength={30} allowClear />
          </Form.Item>

          <Form.Item label="邮箱">
            <Input value={user.email} disabled />
          </Form.Item>

          <Form.Item label="角色">
            <Tag color={roleColor} style={{ fontSize: 14 }}>
              {roleLabel}
            </Tag>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={saveMutation.isPending}
              style={{ height: 40 }}
            >
              保存
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
