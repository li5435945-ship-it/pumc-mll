import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Drawer,
  Switch,
  Typography,
  List,
  Tag,
  Button,
  Upload,
  Space,
  Alert,
  Popconfirm,
  message,
  Spin,
  Grid,
  Progress,
} from 'antd'
import {
  DeleteOutlined,
  ReloadOutlined,
  FileTextOutlined,
  InboxOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import type { UploadFile, RcFile } from 'antd/es/upload'
import { adminApi } from '../api/admin'
import type { RagDocument } from '../api/admin'

const { Text } = Typography
const { useBreakpoint } = Grid

interface ChapterRAGDrawerProps {
  open: boolean
  chapterId: number
  chapterName: string
  onClose: () => void
  onSaved?: () => void
}

interface IndexingProgress {
  step: string
  current?: number
  total?: number
  message: string
}

/** Status tag for a RAG document */
function StatusTag({ status }: { status: RagDocument['status'] }) {
  switch (status) {
    case 'ready':
      return <Tag color="green">已索引</Tag>
    case 'indexing':
      return <Tag color="blue">索引中</Tag>
    case 'failed':
      return <Tag color="red">失败</Tag>
    default:
      return null
  }
}

export default function ChapterRAGDrawer({
  open,
  chapterId,
  chapterName,
  onClose,
  onSaved,
}: ChapterRAGDrawerProps) {
  const screens = useBreakpoint()
  const isMobile = !screens.sm

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ragEnabled, setRagEnabled] = useState(false)
  const [documents, setDocuments] = useState<RagDocument[]>([])
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [uploading, setUploading] = useState(false)

  // Track SSE connections and polling timers
  const sseRef = useRef<EventSource | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Progress tracking for indexing documents
  const [indexingProgress, setIndexingProgress] = useState<Record<number, IndexingProgress>>({})

  // ---------- Fetch RAG data ----------
  const fetchRAG = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminApi.getChapterRAG(chapterId)
      if (res.data) {
        setRagEnabled(res.data.rag_enabled)
        setDocuments(res.data.documents)
      }
    } catch {
      message.error('加载 RAG 配置失败')
    } finally {
      setLoading(false)
    }
  }, [chapterId])

  useEffect(() => {
    if (open) {
      fetchRAG()
      setFileList([])
      setIndexingProgress({})
    }
    return () => {
      // Cleanup SSE connections
      if (sseRef.current) {
        sseRef.current.close()
        sseRef.current = null
      }
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [open, fetchRAG])

  // ---------- SSE for indexing progress ----------
  const startSSE = useCallback((docId: number) => {
    // Close existing connection if any
    if (sseRef.current) {
      sseRef.current.close()
    }

    const token = localStorage.getItem('pumc-mll-auth')
      ? JSON.parse(localStorage.getItem('pumc-mll-auth') || '{}')?.state?.token
      : null

    if (!token) return

    const url = adminApi.getDocumentProgressUrl(docId)
    const eventSource = new EventSource(`${url}?token=${token}`)
    sseRef.current = eventSource

    eventSource.addEventListener('progress', (event) => {
      try {
        const data = JSON.parse(event.data)
        setIndexingProgress((prev) => ({
          ...prev,
          [docId]: data,
        }))
      } catch {
        // Ignore parse errors
      }
    })

    eventSource.addEventListener('complete', (event) => {
      try {
        const data = JSON.parse(event.data)
        // Update document status
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === docId
              ? { ...d, status: 'ready', chunk_count: data.chunk_count }
              : d,
          ),
        )
        setIndexingProgress((prev) => {
          const next = { ...prev }
          delete next[docId]
          return next
        })
        message.success(`文档索引完成，共 ${data.chunk_count} 个分块`)
      } catch {
        // Ignore parse errors
      }
      eventSource.close()
      sseRef.current = null
    })

    eventSource.addEventListener('error', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data || '{}')
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === docId
              ? { ...d, status: 'failed', error_message: data.message }
              : d,
          ),
        )
        message.error(`索引失败: ${data.message || '未知错误'}`)
      } catch {
        // Ignore parse errors
      }
      setIndexingProgress((prev) => {
        const next = { ...prev }
        delete next[docId]
        return next
      })
      eventSource.close()
      sseRef.current = null
    })

    eventSource.onerror = () => {
      // Connection lost, fallback to polling
      eventSource.close()
      sseRef.current = null
    }
  }, [])

  // ---------- Polling fallback for indexing documents ----------
  const readyCount = documents.filter((d) => d.status === 'ready').length
  const hasIndexing = documents.some((d) => d.status === 'indexing')

  useEffect(() => {
    if (open && hasIndexing) {
      pollingRef.current = setInterval(() => {
        adminApi.getChapterRAG(chapterId).then((res) => {
          if (res.data) {
            setDocuments(res.data.documents)
            // Stop polling once no docs are still indexing
            const stillIndexing = res.data.documents.some(
              (d) => d.status === 'indexing',
            )
            if (!stillIndexing && pollingRef.current) {
              clearInterval(pollingRef.current)
              pollingRef.current = null
            }
          }
        })
      }, 3000)
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [open, hasIndexing, chapterId])

  // ---------- Handlers ----------
  const handleToggleRAG = (checked: boolean) => {
    if (checked && readyCount === 0) {
      message.warning('请先上传并等待文档索引完成，再开启 RAG')
      return
    }
    setRagEnabled(checked)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await adminApi.updateChapterRAG(chapterId, { rag_enabled: ragEnabled })
      message.success('RAG 配置已保存')
      onSaved?.()
      onClose()
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (docId: number) => {
    try {
      await adminApi.deleteDocument(docId)
      setDocuments((prev) => prev.filter((d) => d.id !== docId))
      message.success('文档已删除')
    } catch {
      message.error('删除失败')
    }
  }

  const handleReindex = async (docId: number) => {
    try {
      await adminApi.reindexDocument(docId)
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === docId ? { ...d, status: 'indexing' as const } : d,
        ),
      )
      message.info('已提交重新索引')
      // Start SSE for progress
      startSSE(docId)
    } catch {
      message.error('重新索引失败')
    }
  }

  // ---------- Upload ----------
  const handleBeforeUpload = async (file: RcFile) => {
    const validExtensions = ['.docx', '.pdf']
    const ext = file.name
      .toLowerCase()
      .slice(file.name.lastIndexOf('.'))
    if (!validExtensions.includes(ext)) {
      message.error('仅支持 .docx 和 .pdf 格式的文件')
      return Upload.LIST_IGNORE
    }

    const isLt50M = file.size / 1024 / 1024 < 50
    if (!isLt50M) {
      message.error('文件大小不能超过 50MB')
      return Upload.LIST_IGNORE
    }

    setUploading(true)
    try {
      const res = await adminApi.uploadDocument(chapterId, file)
      if (res.data) {
        setDocuments((prev) => [...prev, res.data!])
        message.success('文档上传成功，正在索引...')
        // Start SSE for progress
        startSSE(res.data.id)
      }
    } catch {
      message.error('文档上传失败')
    } finally {
      setUploading(false)
      setFileList([])
    }

    return false
  }

  // ---------- Render ----------
  return (
    <Drawer
      title={chapterName}
      placement="right"
      width={isMobile ? '100%' : 480}
      open={open}
      onClose={onClose}
      destroyOnClose
      footer={
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={saving} onClick={handleSave}>
            保存
          </Button>
        </div>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Spin />
        </div>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* RAG toggle */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text strong style={{ fontSize: 15 }}>
                RAG 知识增强
              </Text>
              <Switch checked={ragEnabled} onChange={handleToggleRAG} />
            </div>
            <Text
              type="secondary"
              style={{ display: 'block', marginTop: 4, fontSize: 13 }}
            >
              开启后，本章 AI 问答与作业反馈将结合下方文档
            </Text>
          </div>

          {/* Warning when no ready documents */}
          {ragEnabled && readyCount === 0 && (
            <Alert
              type="warning"
              showIcon
              icon={<WarningOutlined />}
              message="当前没有已索引的文档，RAG 功能将不会生效。请上传文档并等待索引完成。"
            />
          )}

          {/* Document list */}
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              知识文档 ({documents.length})
            </Text>
            <List<RagDocument>
              dataSource={documents}
              locale={{ emptyText: '暂无文档，请上传 .docx 或 .pdf 文件' }}
              renderItem={(doc) => (
                <List.Item
                  style={{ padding: '8px 0' }}
                  actions={[
                    doc.status === 'failed' ? (
                      <Button
                        type="link"
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={() => handleReindex(doc.id)}
                      >
                        重新索引
                      </Button>
                    ) : undefined,
                    <Popconfirm
                      key="del"
                      title="确定删除此文档？"
                      description="删除后相关索引数据也将清除。"
                      onConfirm={() => handleDelete(doc.id)}
                      okText="确定"
                      cancelText="取消"
                    >
                      <Button
                        type="link"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                      />
                    </Popconfirm>,
                  ].filter(Boolean)}
                >
                  <List.Item.Meta
                    avatar={
                      <FileTextOutlined
                        style={{ fontSize: 20, color: '#1a5c3a', marginTop: 4 }}
                      />
                    }
                    title={
                      <Space size="small" wrap>
                        <Text
                          ellipsis
                          style={{ maxWidth: isMobile ? 140 : 240 }}
                        >
                          {doc.filename}
                        </Text>
                        <StatusTag status={doc.status} />
                      </Space>
                    }
                    description={
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {doc.status === 'ready'
                            ? `${doc.chunk_count} 个分块`
                            : doc.status === 'indexing'
                              ? '正在索引中...'
                              : '索引失败'}
                        </Text>
                        {/* Progress bar for indexing documents */}
                        {doc.status === 'indexing' && indexingProgress[doc.id] && (
                          <div style={{ marginTop: 4 }}>
                            <Progress
                              percent={
                                indexingProgress[doc.id].current && indexingProgress[doc.id].total
                                  ? Math.round(
                                      (indexingProgress[doc.id].current! / indexingProgress[doc.id].total!) * 100,
                                    )
                                  : undefined
                              }
                              size="small"
                              status="active"
                              format={() => indexingProgress[doc.id].message}
                            />
                          </div>
                        )}
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          </div>

          {/* Upload area */}
          <Upload.Dragger
            accept=".docx,.pdf"
            fileList={fileList}
            onChange={({ fileList: newList }) => setFileList(newList)}
            beforeUpload={handleBeforeUpload}
            maxCount={1}
            disabled={uploading}
            style={{ padding: isMobile ? '16px 8px' : '20px 16px' }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined
                style={{ fontSize: isMobile ? 36 : 42, color: '#1a5c3a' }}
              />
            </p>
            <p
              className="ant-upload-text"
              style={{ fontSize: isMobile ? 14 : 15 }}
            >
              {uploading ? '正在上传...' : '点击或拖拽文档到此区域上传'}
            </p>
            <p
              className="ant-upload-hint"
              style={{ fontSize: isMobile ? 12 : 13 }}
            >
              支持 .docx、.pdf 格式，文件大小不超过 50MB
            </p>
          </Upload.Dragger>
        </Space>
      )}
    </Drawer>
  )
}
