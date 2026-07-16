import { useState, useEffect } from 'react'
import { Card, Row, Col, Tag, Typography, Empty, Grid, Spin, message } from 'antd'
import { BookOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { coursesApi } from '../../api/courses'
import type { Course } from '../../types/api'

const { Title, Paragraph } = Typography
const { useBreakpoint } = Grid

export default function CoursesPage() {
  const navigate = useNavigate()
  const screens = useBreakpoint()
  const isMobile = !screens.sm
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState<Course[]>([])

  // Cover image height: 100px mobile, 140px desktop
  const coverHeight = isMobile ? 100 : 140

  // Column span: 1 col mobile, 2 tablet, 3 desktop, 4 wide desktop
  const colSpan = screens.lg ? 6 : screens.md ? 8 : screens.sm ? 12 : 24

  useEffect(() => {
    const fetchCourses = async () => {
      setLoading(true)
      try {
        const res = await coursesApi.getCourses()
        if (res.data) {
          setCourses(res.data)
        }
      } catch {
        message.error('加载课程列表失败')
      } finally {
        setLoading(false)
      }
    }
    fetchCourses()
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div style={{ padding: isMobile ? '12px 0' : '0' }}>
      <Title level={4} style={{ marginBottom: isMobile ? 12 : 16 }}>
        课程列表
      </Title>

      {courses.length === 0 ? (
        <Empty description="暂无课程" />
      ) : (
        <Row gutter={[isMobile ? 12 : 16, isMobile ? 12 : 16]}>
          {courses.map((course) => (
            <Col key={course.id} span={colSpan}>
              <Card
                hoverable
                style={{ height: '100%' }}
                onClick={() => navigate(`/courses/${course.id}`)}
                bodyStyle={{ padding: isMobile ? 12 : '24px 24px 16px' }}
                cover={
                  <div
                    style={{
                      height: coverHeight,
                      background: course.cover_url
                        ? undefined
                        : 'linear-gradient(135deg, #1a5c3a, #2d8c5a)',
                      backgroundImage: course.cover_url
                        ? `url(${course.cover_url})`
                        : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {!course.cover_url && (
                      <BookOutlined
                        style={{ fontSize: isMobile ? 36 : 48, color: '#fff' }}
                      />
                    )}
                  </div>
                }
              >
                <Card.Meta
                  title={
                    <span
                      style={{
                        fontSize: isMobile ? 14 : 16,
                        lineHeight: 1.4,
                        wordBreak: 'break-word',
                      }}
                    >
                      {course.name}
                    </span>
                  }
                  description={
                    <div>
                      <Paragraph
                        ellipsis={{ rows: 2 }}
                        style={{
                          marginBottom: 8,
                          fontSize: isMobile ? 12 : 14,
                        }}
                      >
                        {course.intro || '暂无简介'}
                      </Paragraph>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: isMobile ? 4 : 8,
                        }}
                      >
                        {course.chapter_count != null && (
                          <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                            {course.chapter_count} 章节
                          </Tag>
                        )}
                        {course.question_count != null && (
                          <Tag color="green" style={{ marginInlineEnd: 0 }}>
                            {course.question_count} 题
                          </Tag>
                        )}
                      </div>
                    </div>
                  }
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  )
}
