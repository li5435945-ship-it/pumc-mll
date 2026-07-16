import { useState, useEffect } from 'react'
import { Layout, Menu, Drawer, Button, Space, Avatar, Dropdown, message } from 'antd'
import {
  BookOutlined,
  TeamOutlined,
  MenuOutlined,
  ArrowLeftOutlined,
  UserOutlined,
  LogoutOutlined,
} from '@ant-design/icons'
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuthStore, logoutAndClear } from '../stores/authStore'

const { Header, Sider, Content } = Layout

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    () => window.innerWidth < breakpoint,
  )

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [breakpoint])

  return isMobile
}

const sidebarMenuItems = [
  { key: '/admin/courses', icon: <BookOutlined />, label: '课程管理' },
  { key: '/admin/students', icon: <TeamOutlined />, label: '学生管理' },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuthStore()
  const isMobile = useIsMobile()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Resolve the current sidebar selected key from the pathname
  const selectedKey =
    sidebarMenuItems.find((item) => location.pathname.startsWith(item.key))
      ?.key ?? '/admin/courses'

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key)
    setDrawerOpen(false)
  }

  const userMenuItems = [
    { key: 'profile', label: '个人中心', icon: <UserOutlined /> },
    { key: 'logout', label: '退出登录', icon: <LogoutOutlined />, danger: true },
  ]

  const handleUserMenu = async ({ key }: { key: string }) => {
    if (key === 'logout') {
      await logoutAndClear()
      navigate('/login')
    } else if (key === 'profile') {
      message.info('个人中心功能开发中')
    }
  }

  const sidebarContent = (
    <Menu
      mode="inline"
      selectedKeys={[selectedKey]}
      items={sidebarMenuItems}
      onClick={handleMenuClick}
      style={{ height: '100%', borderRight: 0 }}
    />
  )

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Desktop sidebar */}
      {!isMobile && (
        <Sider
          width={220}
          style={{
            background: '#fff',
            borderRight: '1px solid #f0f0f0',
            overflow: 'auto',
            height: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
          }}
        >
          <div
            style={{
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: 18,
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            PUMC MLL 管理后台
          </div>
          {sidebarContent}
        </Sider>
      )}

      {/* Mobile drawer */}
      {isMobile && (
        <Drawer
          title="管理后台"
          placement="left"
          onClose={() => setDrawerOpen(false)}
          open={drawerOpen}
          width={240}
          styles={{ body: { padding: 0 } }}
        >
          {sidebarContent}
        </Drawer>
      )}

      <Layout
        style={{
          marginLeft: isMobile ? 0 : 220,
          transition: 'margin-left 0.2s',
        }}
      >
        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#fff',
            borderBottom: '1px solid #f0f0f0',
            padding: isMobile ? '0 16px' : '0 24px',
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}
        >
          <Space>
            {isMobile && (
              <Button
                type="text"
                icon={<MenuOutlined />}
                onClick={() => setDrawerOpen(true)}
                style={{ fontSize: 18 }}
              />
            )}
            <Link
              to="/courses"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: '#1677ff',
                whiteSpace: 'nowrap',
              }}
            >
              <ArrowLeftOutlined />
              返回学生端
            </Link>
          </Space>

          <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenu }}>
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} src={user?.avatar_url} size="small" />
              {!isMobile && <span>{user?.nickname || user?.email || '管理员'}</span>}
            </Space>
          </Dropdown>
        </Header>

        <Content
          style={{
            padding: isMobile ? '16px' : '24px',
            minHeight: 'calc(100vh - 64px)',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
