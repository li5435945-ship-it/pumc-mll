import { Card, Form, Input, Button, message, Typography } from 'antd'
import { MailOutlined, LockOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '../../api/auth'
import { useAuthStore } from '../../stores/authStore'

const { Title, Text } = Typography

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [searchParams] = useSearchParams()
  const presetEmail = searchParams.get('email') || ''

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (res) => {
      if (res.data) {
        setAuth(res.data.token, res.data.user)
        message.success('登录成功')
        // Navigate based on user role
        if (res.data.user.role === 'admin') {
          navigate('/admin/courses')
        } else {
          navigate('/courses')
        }
      }
    },
    onError: () => {
      message.error('邮箱或密码错误')
    },
  })

  const onFinish = (values: { email: string; password: string }) => {
    loginMutation.mutate(values)
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        minWidth: '100vw',
        background: 'linear-gradient(135deg, #1a5c3a 0%, #0d3d24 100%)',
        padding: '16px',
        boxSizing: 'border-box',
      }}
    >
      <Card
        style={{
          width: '90%',
          maxWidth: 400,
          borderRadius: 8,
          boxSizing: 'border-box',
        }}
        styles={{
          body: { padding: '24px 16px' },
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title
            level={3}
            style={{
              color: '#1a5c3a',
              margin: 0,
              fontSize: 'clamp(18px, 5vw, 24px)',
            }}
          >
            ✚ PUMC MLL
          </Title>
          <Text
            style={{
              color: '#666',
              marginTop: 8,
              display: 'block',
              fontSize: 'clamp(13px, 3.5vw, 16px)',
            }}
          >
            医学教育刷题平台
          </Text>
        </div>

        <Form onFinish={onFinish} autoComplete="off" size="large" initialValues={{ email: presetEmail }}>
          <Form.Item
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input
              prefix={<MailOutlined />}
              placeholder="邮箱"
              style={{ height: 44 }}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
              style={{ height: 44 }}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loginMutation.isPending}
              style={{ height: 44, fontSize: 16 }}
            >
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
      <div
        style={{
          position: 'fixed',
          bottom: 16,
          left: 0,
          right: 0,
          textAlign: 'center',
        }}
      >
        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
          京ICP备XXXXXXXX号
        </span>
      </div>
    </div>
  )
}
