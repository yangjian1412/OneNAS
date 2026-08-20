import { useEffect, useState } from 'react'
import { Keyboard, KeyboardEvent } from 'react-native'

/**
 * 实时订阅软键盘高度（像素）。键盘关闭时为 0。
 * 通过 Keyboard.addListener 监听 keyboardDidShow/Hide，覆盖 Android edge-to-edge 场景。
 */
export function useKeyboardHeight(): number {
  const [h, setH] = useState(0)
  useEffect(() => {
    const onShow = (e: KeyboardEvent) => {
      // Android edge-to-edge 下：endCoordinates.height 即真实键盘高度
      const height = e.endCoordinates?.height ?? 0
      setH(height)
    }
    const onHide = () => setH(0)
    const showSub = Keyboard.addListener('keyboardDidShow', onShow)
    const hideSub = Keyboard.addListener('keyboardDidHide', onHide)
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])
  return h
}
