/**
 * 云端账号配置：整个网站共用一个 Supabase 项目（由站长创建一次）。
 * 创建步骤见 README「云端账号」章节。填好后重新构建/刷新即可生效。
 * anon key 是公开密钥，安全由数据库的 RLS 策略保证（每人只能读写自己的数据）。
 */
export const SUPABASE_URL = 'https://rugtsqgldpxmrcbighrv.supabase.co'
export const SUPABASE_ANON_KEY = 'sb_publishable_Mn_gkd_lYkcIenxlarbimg_e672HFLC'

export function cloudEnabled() {
  return SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 20
}

export const CLOUD_PROFILE_ID = '@cloud'
