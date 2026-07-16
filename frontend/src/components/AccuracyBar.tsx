import { Progress } from 'antd'

interface AccuracyBarProps {
  /** Accuracy rate 0-100, null/undefined means no data */
  rate: number | null | undefined
  /** Show the percentage text, defaults to true */
  showText?: boolean
  /** Width of the progress bar in pixels, defaults to 120 */
  width?: number
}

/**
 * Colored accuracy progress bar:
 *   - Green  (>=80%)
 *   - Orange (60% - 79%)
 *   - Red    (<60%)
 *   - Grey   (no data)
 */
export default function AccuracyBar({
  rate,
  showText = true,
  width = 120,
}: AccuracyBarProps) {
  // No data yet
  if (rate === null || rate === undefined) {
    return <span style={{ color: '#999' }}>-</span>
  }

  const percent = Math.round(rate)

  let strokeColor: string
  if (percent >= 80) {
    strokeColor = '#52c41a'   // green
  } else if (percent >= 60) {
    strokeColor = '#fa8c16'   // orange
  } else {
    strokeColor = '#f5222d'   // red
  }

  return (
    <Progress
      percent={percent}
      size="small"
      strokeColor={strokeColor}
      style={{ width, margin: 0 }}
      format={(p) => (showText ? `${p}%` : '')}
    />
  )
}
