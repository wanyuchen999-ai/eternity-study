/** 读取图片并压缩为 dataURL（长边 maxSize，控制请求体积） */
export function fileToDataURL(file: File, maxSize = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        if (scale >= 1) {
          resolve(String(r.result ?? ''))
          return
        }
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(String(r.result ?? ''))
          return
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = () => reject(new Error('图片读取失败'))
      img.src = String(r.result ?? '')
    }
    r.onerror = () => reject(new Error('文件读取失败'))
    r.readAsDataURL(file)
  })
}
