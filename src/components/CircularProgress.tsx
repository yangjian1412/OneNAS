import { View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'

interface Props {
  size: number
  strokeWidth: number
  progress: number
  color: string
  bgColor: string
  children?: React.ReactNode
}

export default function CircularProgress({ size, strokeWidth, progress, color, bgColor, children }: Props) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - Math.min(Math.max(progress, 0), 1))
  const rotate = -90

  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={bgColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          fill="none"
          transform={`rotate(${rotate}, ${size / 2}, ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  )
}