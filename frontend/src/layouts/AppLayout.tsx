import { useState, useEffect } from 'react'
import { Layout, Menu, Dropdown, Avatar, Space, Drawer, Button } from 'antd'
import {
  UserOutlined,
  LogoutOutlined,
  MenuOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore, logoutAndClear } from '../stores/authStore'

const { Header, Content, Footer } = Layout

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

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuthStore()
  const isMobile = useIsMobile()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const menuItems = [
    { key: '/courses', label: '课程列表' },
    { key: '/wrong-questions', label: '错题本' },
    ...(user?.role === 'admin'
      ? [{ key: '/admin', label: '管理后台', icon: <SettingOutlined /> }]
      : []),
  ]

  const userMenuItems = [
    { key: 'profile', label: '个人中心', icon: <UserOutlined /> },
    { key: 'logout', label: '退出登录', icon: <LogoutOutlined />, danger: true },
  ]

  const handleUserMenu = async ({ key }: { key: string }) => {
    if (key === 'logout') {
      await logoutAndClear()
      navigate('/login')
    } else if (key === 'profile') {
      navigate('/profile')
    }
  }

  const handleNavClick = ({ key }: { key: string }) => {
    navigate(key)
    setDrawerOpen(false)
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#001529',
          padding: isMobile ? '0 16px' : '0 24px',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <Space size={isMobile ? 'small' : 'middle'}>
          {isMobile && (
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setDrawerOpen(true)}
              style={{ color: '#fff', fontSize: 18 }}
            />
          )}
          <div
            style={{
              color: '#fff',
              fontSize: isMobile ? 16 : 18,
              fontWeight: 'bold',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            onClick={() => navigate('/courses')}
          >
            ✚ PUMC MLL
          </div>
          {!isMobile && (
            <Menu
              theme="dark"
              mode="horizontal"
              selectedKeys={[location.pathname]}
              items={menuItems}
              onClick={handleNavClick}
              style={{ flex: 1, minWidth: 0, background: 'transparent' }}
            />
          )}
        </Space>

        <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenu }}>
          <Space style={{ cursor: 'pointer', color: '#fff' }}>
            <Avatar icon={<UserOutlined />} src={user?.avatar_url} />
            {!isMobile && (
              <span>{user?.nickname || user?.email || '未登录'}</span>
            )}
          </Space>
        </Dropdown>
      </Header>

      {isMobile && (
        <Drawer
          title="导航"
          placement="left"
          onClose={() => setDrawerOpen(false)}
          open={drawerOpen}
          width={240}
          styles={{ body: { padding: 0 } }}
        >
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={handleNavClick}
          />
        </Drawer>
      )}

      <Content
        style={{
          padding: isMobile ? '16px' : '24px',
          maxWidth: 1200,
          margin: '0 auto',
          width: '100%',
        }}
      >
        <Outlet />
      </Content>

      <Footer
        style={{
          textAlign: 'center',
          color: '#999',
          padding: isMobile ? '16px' : '24px',
          wordBreak: 'break-word',
          lineHeight: 1.6,
        }}
      >
        PUMC MLL &copy;2026 | 京ICP备XXXXXXXX号
      </Footer>
    </Layout>
  )
}
