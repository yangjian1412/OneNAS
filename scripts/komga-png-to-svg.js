// 用 sharp 把 komga.png 转为内嵌 base64 的 SVG（保持矢量容器以适配 Icon.tsx）
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const PNG_PATH = path.join(__dirname, '..', 'upload', 'komga.png')
const OUT_SVG = path.join(__dirname, '..', 'src', 'icos', 'komga.svg')

;(async () => {
  // 1) 读取 PNG 原始尺寸
  const meta = await sharp(PNG_PATH).metadata()
  const W = meta.width
  const H = meta.height

  // 2) 重新编码为 PNG（去掉 alpha 透明，统一背景）
  //    缩小到 256x256（图标尺寸即可，避免文件过大）
  const TARGET = 256
  const buf = await sharp(PNG_PATH)
    .resize(TARGET, TARGET, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  // 3) base64 编码
  const b64 = buf.toString('base64')

  // 4) 写入 SVG（内嵌 PNG，用 viewBox 让 react-native-svg-transformer 可缩放）
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <image href="data:image/png;base64,${b64}" width="${W}" height="${H}" />
</svg>
`
  fs.writeFileSync(OUT_SVG, svg, 'utf8')
  console.log(`Wrote ${OUT_SVG} (${(svg.length / 1024).toFixed(1)} KB, ${W}x${H})`)
})().catch((e) => { console.error(e); process.exit(1) })