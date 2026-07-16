import { Card, Typography, Space } from 'antd'
import { CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons'

const { Text, Paragraph } = Typography

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E']

interface OptionState {
  selected: string | null
  correctAnswer: string | null
  answered: boolean
}

interface QuestionCardProps {
  content: string
  options: string[]
  optionState: OptionState
  explanation?: string
  onSelect: (label: string) => void
  isMobile: boolean
  hideContent?: boolean
}

function getOptionStyle(
  label: string,
  { selected, correctAnswer, answered }: OptionState,
): React.CSSProperties {
  const base: React.CSSProperties = {
    cursor: answered ? 'default' : 'pointer',
    borderRadius: 8,
    transition: 'all 0.2s',
    width: '100%',
  }

  if (!answered) {
    if (selected === label) {
      return {
        ...base,
        border: '2px solid #1677ff',
        background: '#e6f4ff',
      }
    }
    return {
      ...base,
      border: '2px solid #f0f0f0',
      background: '#fff',
    }
  }

  // After answering
  if (label === correctAnswer) {
    return {
      ...base,
      border: '2px solid #52c41a',
      background: '#f6ffed',
    }
  }
  if (selected === label && label !== correctAnswer) {
    return {
      ...base,
      border: '2px solid #ff4d4f',
      background: '#fff2f0',
    }
  }
  return {
    ...base,
    border: '2px solid #f0f0f0',
    background: '#fafafa',
    opacity: 0.65,
  }
}

function getOptionSuffix(
  label: string,
  { selected, correctAnswer, answered }: OptionState,
) {
  if (!answered) return null
  if (label === correctAnswer) {
    return <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} />
  }
  if (selected === label && label !== correctAnswer) {
    return <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 18 }} />
  }
  return null
}

export default function QuestionCard({
  content,
  options,
  optionState,
  explanation,
  onSelect,
  isMobile,
  hideContent,
}: QuestionCardProps) {
  return (
    <div>
      {/* Question content */}
      {!hideContent && content && (
        <Paragraph
          style={{
            fontSize: isMobile ? 15 : 16,
            fontWeight: 500,
            lineHeight: 1.8,
            marginBottom: isMobile ? 16 : 24,
          }}
        >
          {content}
        </Paragraph>
      )}

      {/* Options */}
      <Space direction="vertical" size={isMobile ? 8 : 12} style={{ width: '100%' }}>
        {options.map((opt, idx) => {
          const label = OPTION_LABELS[idx]
          const style = getOptionStyle(label, optionState)
          const suffix = getOptionSuffix(label, optionState)

          return (
            <Card
              key={label}
              hoverable={!optionState.answered}
              style={style}
              bodyStyle={{
                padding: isMobile ? '10px 12px' : '12px 16px',
              }}
              onClick={() => {
                if (!optionState.answered) onSelect(label)
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: isMobile ? 8 : 12,
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: isMobile ? 24 : 28,
                    height: isMobile ? 24 : 28,
                    borderRadius: '50%',
                    background:
                      optionState.selected === label
                        ? '#1677ff'
                        : optionState.answered && label === optionState.correctAnswer
                          ? '#52c41a'
                          : '#f0f0f0',
                    color:
                      optionState.selected === label ||
                      (optionState.answered && label === optionState.correctAnswer)
                        ? '#fff'
                        : '#666',
                    fontWeight: 600,
                    fontSize: isMobile ? 13 : 14,
                    flexShrink: 0,
                  }}
                >
                  {label}
                </span>
                <Text
                  style={{
                    flex: 1,
                    fontSize: isMobile ? 14 : 15,
                    lineHeight: 1.6,
                  }}
                >
                  {opt}
                </Text>
                {suffix}
              </div>
            </Card>
          )
        })}
      </Space>

      {/* Explanation */}
      {optionState.answered && explanation && (
        <Card
          style={{
            marginTop: isMobile ? 16 : 20,
            borderRadius: 8,
            background: '#fafafa',
            border: '1px solid #e8e8e8',
          }}
          bodyStyle={{ padding: isMobile ? 12 : 16 }}
        >
          <Text
            strong
            style={{
              display: 'block',
              marginBottom: 6,
              fontSize: isMobile ? 14 : 15,
              color: '#1677ff',
            }}
          >
            解析
          </Text>
          <Paragraph
            style={{
              margin: 0,
              fontSize: isMobile ? 13 : 14,
              lineHeight: 1.8,
              whiteSpace: 'pre-wrap',
            }}
          >
            {explanation}
          </Paragraph>
        </Card>
      )}
    </div>
  )
}
