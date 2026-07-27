declare module '*.svg' {
  import type { ComponentType } from 'react'
  const Cmp: ComponentType<{
    width?: number | string
    height?: number | string
    size?: number | string
    color?: string
    fill?: string
    style?: any
  }>
  export default Cmp
}