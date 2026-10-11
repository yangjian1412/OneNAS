import { useMemo } from 'react'
import { useWindowDimensions } from 'react-native'

/**
 * 全项目唯一的窗口尺寸来源。
 *
 * 为什么不能用 `Dimensions.get('window')`：
 * 它是「一次性快照」，模块 import 时求值，之后永不更新。平板 / 折叠屏展开 /
 * 分屏 / 横屏都会改变窗口尺寸，而 Android 16 (targetSdk 36) 在大屏设备上
 * **强制忽略 `screenOrientation` 竖屏锁**，所以本 App 真的会被 resize。
 * 快照值会让抽屉宽度、网格列数、翻页步长等全部算错。
 *
 * 断点参考（dp）：
 *  - compact  < 600  手机竖屏 / 分屏窄窗
 *  - medium   600-839 平板竖屏、折叠屏展开
 *  - expanded >= 840  平板横屏、大屏
 */
export interface ResponsiveLayout {
  /** 窗口宽（已扣除左右 inset） */
  width: number
  /** 窗口高（已扣除上下 inset） */
  height: number
  isLandscape: boolean
  /** >= 600dp：平板 / 折叠屏展开 */
  isWide: boolean
  /** >= 840dp：平板横屏 / 大屏 */
  isExpanded: boolean
  isCompact: boolean
  /** 内容区最大宽度，宽屏时居中，避免超长行难读 */
  contentMaxWidth: number
  /** 网格列数：按卡片目标宽度反推，至少 2 列 */
  gridColumns: number
  /** 抽屉宽度：按比例但封顶，平板上不糊满整屏 */
  drawerWidth: number
  /** 底部弹层安全最大高度 */
  sheetMaxHeight: number
}

function breakpoints(width: number, height: number): Omit<ResponsiveLayout, 'width' | 'height'> {
  const isLandscape = width > height
  // 断点按「窗口宽度」判定（Material window size classes）。
  // 旧实现用 Math.min(width, height) >= 840 会把平板横屏 1280×800（min=800）
  // 误判成非 expanded → contentMaxWidth 收窄居中，两侧留大片空白。
  const isWide = width >= 600
  const isExpanded = width >= 840
  const isCompact = !isWide

  // 卡片目标宽度约 168dp（列表视图）；宽屏按此反推列数
  const target = isExpanded ? 176 : isWide ? 168 : 164
  const gridColumns = Math.max(2, Math.floor(width / target))

  // 内容区占满宽度：平板/横屏上收窄居中会两侧留大片空白，铺满才能扩展列数
  const contentMaxWidth = width

  // 抽屉：平板横屏下 75% 会太宽，封顶 420
  const drawerWidth = Math.min(Math.round(width * 0.75), 420)

  // 弹层：留出顶部 15% 给标题/状态栏
  const sheetMaxHeight = Math.round(height * 0.85)

  return { isLandscape, isWide, isExpanded, isCompact, contentMaxWidth, gridColumns, drawerWidth, sheetMaxHeight }
}

export function useLayout(): ResponsiveLayout {
  const { width: winW, height: winH } = useWindowDimensions()
  return useMemo(() => {
    const width = Math.max(1, winW)
    const height = Math.max(1, winH)
    return { width, height, ...breakpoints(width, height) }
  }, [winW, winH])
}

/** 非 hook 场景（如模块级常量、动画初值）需要最新尺寸时使用 */
export function layoutBreakpoints(width: number, height: number) {
  return breakpoints(Math.max(1, width), Math.max(1, height))
}
