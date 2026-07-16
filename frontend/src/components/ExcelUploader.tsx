import { useState } from 'react'
import {
  Upload,
  Button,
  Space,
  Alert,
  Typography,
  Progress,
  message,
  Grid,
  Steps,
  Table,
  Descriptions,
} from 'antd'
import {
  DownloadOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  FileExcelOutlined,
  EyeOutlined,
  ImportOutlined,
} from '@ant-design/icons'
import type { UploadFile, RcFile } from 'antd/es/upload'
import type { ColumnsType } from 'antd/es/table'
import { adminApi } from '../api/admin'
import type {
  ImportPreviewResult,
  ImportChapterPreview,
  ImportConfirmResult,
} from '../api/admin'

const { Dragger } = Upload
const { Text, Title } = Typography
const { useBreakpoint } = Grid

interface ExcelUploaderProps {
  courseId: number
  onSuccess?: (result: ImportConfirmResult) => void
}

type StepIndex = 0 | 1 | 2

export default function ExcelUploader({
  courseId,
  onSuccess,
}: ExcelUploaderProps) {
  const screens = useBreakpoint()
  const isMobile = !screens.sm

  // ── Step state ──
  const [currentStep, setCurrentStep] = useState<StepIndex>(0)

  // ── Upload state ──
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // ── Preview state ──
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null)

  // ── Confirm state ──
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<ImportConfirmResult | null>(null)

  // ── Download template ──
  const handleDownloadTemplate = async () => {
    try {
      const blob = await adminApi.downloadTemplate()
      const url = window.URL.createObjectURL(blob as unknown as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'import_template.xlsx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      message.success('模板下载成功')
    } catch {
      // Fallback: generate CSV
      const header =
        '章节名称,题目内容,选项A,选项B,选项C,选项D,选项E,正确答案,解析,排序\n'
      const sample =
        '第一章 基础知识,人体最大的器官是什么？,心脏,肝脏,皮肤,大脑,,C,皮肤是人体面积最大的器官,\n'
      const blob = new Blob(['﻿' + header + sample], {
        type: 'text/csv;charset=utf-8',
      })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'import_template.csv'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      message.success('模板下载成功（CSV 格式）')
    }
  }

  // ── Step 1: Upload & Preview ──
  const handleBeforeUpload = async (file: RcFile) => {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ]
    const isValid =
      validTypes.includes(file.type) ||
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls') ||
      file.name.endsWith('.csv')

    if (!isValid) {
      message.error('仅支持 .xlsx、.xls、.csv 格式的文件')
      return Upload.LIST_IGNORE
    }

    const isLt10M = file.size / 1024 / 1024 < 10
    if (!isLt10M) {
      message.error('文件大小不能超过 10MB')
      return Upload.LIST_IGNORE
    }

    setUploading(true)
    setUploadProgress(0)
    setPreview(null)
    setResult(null)

    // Simulate progress
    const progressTimer = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressTimer)
          return 90
        }
        return prev + 15
      })
    }, 150)

    try {
      const res = await adminApi.importPreview(courseId, file)
      clearInterval(progressTimer)
      setUploadProgress(100)

      if (res.data) {
        setPreview(res.data)
        setCurrentStep(1)
        if (res.data.error_count > 0) {
          message.warning(
            `解析完成：${res.data.valid_count} 行有效，${res.data.error_count} 行有错误`,
          )
        } else {
          message.success(`解析完成：${res.data.total_rows} 行全部有效`)
        }
      }
    } catch {
      clearInterval(progressTimer)
      setUploadProgress(0)
      message.error('文件解析失败，请检查文件格式是否正确')
    } finally {
      setUploading(false)
      setFileList([])
    }

    return false
  }

  // ── Step 2: Confirm import ──
  const handleConfirmImport = async () => {
    if (!preview) return

    setConfirming(true)
    try {
      const res = await adminApi.importConfirm(courseId, {
        preview_id: preview.preview_id,
      })

      if (res.data) {
        setResult(res.data)
        setCurrentStep(2)
        message.success(
          `导入完成：成功导入 ${res.data.imported_count} 题，${res.data.chapter_count} 个章节`,
        )
        onSuccess?.(res.data)
      }
    } catch {
      message.error('导入失败，请重试')
    } finally {
      setConfirming(false)
    }
  }

  // ── Reset to step 0 ──
  const handleReset = () => {
    setCurrentStep(0)
    setPreview(null)
    setResult(null)
    setFileList([])
    setUploadProgress(0)
  }

  // ── Chapter summary columns ──
  const chapterColumns: ColumnsType<ImportChapterPreview> = [
    {
      title: '章节名称',
      dataIndex: 'name',
      ellipsis: true,
    },
    {
      title: '题目数',
      dataIndex: 'question_count',
      width: 80,
      align: 'center',
    },
  ]

  // ── Step items ──
  const stepItems = [
    { title: '上传文件', icon: <FileExcelOutlined /> },
    { title: '预览确认', icon: <EyeOutlined /> },
    { title: '导入完成', icon: <CheckCircleOutlined /> },
  ]

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {/* Steps indicator */}
      <Steps
        current={currentStep}
        items={stepItems}
        size={isMobile ? 'small' : 'default'}
        direction={isMobile ? 'vertical' : 'horizontal'}
      />

      {/* Template download */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <Button
          icon={<DownloadOutlined />}
          onClick={handleDownloadTemplate}
          size={isMobile ? 'small' : 'middle'}
        >
          下载模板
        </Button>
      </div>

      {/* ====== STEP 0: Upload ====== */}
      {currentStep === 0 && (
        <>
          <Dragger
            accept=".xlsx,.xls,.csv"
            fileList={fileList}
            onChange={({ fileList: newList }) => setFileList(newList)}
            beforeUpload={handleBeforeUpload}
            maxCount={1}
            disabled={uploading}
            style={{ padding: isMobile ? '16px 8px' : '24px 16px' }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined
                style={{ fontSize: isMobile ? 36 : 48, color: '#1a5c3a' }}
              />
            </p>
            <p
              className="ant-upload-text"
              style={{ fontSize: isMobile ? 14 : 16 }}
            >
              点击或拖拽 Excel 文件到此区域上传
            </p>
            <p
              className="ant-upload-hint"
              style={{ fontSize: isMobile ? 12 : 14 }}
            >
              支持 .xlsx、.xls、.csv 格式，文件大小不超过 10MB
            </p>
          </Dragger>

          {uploading && (
            <div>
              <Space
                align="center"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  marginBottom: 8,
                }}
              >
                <Text>正在解析文件，请稍候...</Text>
              </Space>
              <Progress
                percent={uploadProgress}
                status="active"
                strokeColor="#1a5c3a"
              />
            </div>
          )}
        </>
      )}

      {/* ====== STEP 1: Preview ====== */}
      {currentStep === 1 && preview && (
        <>
          {/* Summary */}
          <Descriptions
            bordered
            column={isMobile ? 1 : 3}
            size="small"
            style={{ marginBottom: 16 }}
          >
            <Descriptions.Item label="总行数">
              <Text strong>{preview.total_rows}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="有效行数">
              <Text style={{ color: '#52c41a' }} strong>
                {preview.valid_count}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="错误行数">
              <Text style={{ color: preview.error_count > 0 ? '#ff4d4f' : undefined }} strong>
                {preview.error_count}
              </Text>
            </Descriptions.Item>
          </Descriptions>

          {/* Error details */}
          {preview.errors.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message={`有 ${preview.error_count} 行存在错误，将被跳过。请检查后重新上传，或确认只导入有效行。`}
              description={
                <ul style={{ margin: '4px 0 0', paddingLeft: 20, maxHeight: 120, overflow: 'auto' }}>
                  {preview.errors.map((err, i) => (
                    <li key={i}>
                      <Text type="danger">第 {err.row} 行: {err.message}</Text>
                    </li>
                  ))}
                </ul>
              }
              style={{ marginBottom: 12 }}
            />
          )}

          {/* Chapter summary */}
          {preview.chapters.length > 0 && (
            <>
              <Title level={5}>章节概览</Title>
              <Table<ImportChapterPreview>
                columns={chapterColumns}
                dataSource={preview.chapters}
                rowKey="name"
                pagination={false}
                size="small"
                style={{ marginBottom: 16 }}
              />
            </>
          )}

          {/* Action buttons */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
              marginTop: 16,
            }}
          >
            <Button onClick={handleReset}>重新上传</Button>
            <Button
              type="primary"
              icon={<ImportOutlined />}
              onClick={handleConfirmImport}
              loading={confirming}
              disabled={preview.valid_count === 0}
              style={{ background: '#1a5c3a', borderColor: '#1a5c3a' }}
            >
              确认导入（{preview.valid_count} 题）
            </Button>
          </div>
        </>
      )}

      {/* ====== STEP 2: Result ====== */}
      {currentStep === 2 && result && (
        <>
          <Alert
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
            message={
              <span>
                导入完成：成功导入 <Text strong>{result.imported_count}</Text> 题，
                共 <Text strong>{result.chapter_count}</Text> 个章节
              </span>
            }
          />

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Button type="primary" onClick={handleReset}>
              继续导入
            </Button>
          </div>
        </>
      )}

      {/* Global styles for error rows */}
      <style>{`
        .import-row-error td {
          background: #fff2f0 !important;
        }
      `}</style>
    </Space>
  )
}
