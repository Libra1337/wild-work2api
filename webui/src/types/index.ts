export interface ApiError {
  error?: string
}

export interface SessionInfo {
  authenticated: boolean
  csrf_token?: string
}

export interface LoginResult {
  success: boolean
  error?: string
  csrf_token?: string
}

export interface LogoutResult {
  success: boolean
}

export type Channel = "workbuddy" | "traework" | "qoder"

export interface AccountView {
  uid: string
  group: Channel
  nickname: string
  credits: number
  cooling: boolean
  until: string
  reason: string
  disabled: boolean
  err_count: number
  last_checkin_ok: boolean
  last_checkin_at: string
  last_checkin_msg: string
}

export interface AppState {
  accounts: AccountView[]
  checkin_times: string[]
  keepalive_hours: number[]
  listen_host: string
  listen_port: number
  api_key: string
  login_busy: boolean
  next_checkin: string
  version: string
  autostart: boolean
  running: boolean
}

export interface LoginStartResult {
  auth_url: string
}

export interface SimpleResult {
  ok?: boolean
  msg?: string
  error?: string
}

export interface ImportResult {
  ok: boolean
  uid?: string
  nickname?: string
  error?: string
}

export interface FeeModel {
  model: string
  rate: string
  note: string
}

export interface FeesInfo {
  note: string
  disclaimer: string
  cached_at: string
  error?: string
  channels: { channel: Channel; models: FeeModel[] }[]
}

export interface LogsData {
  lines: string[]
}

export interface ResourceDetail {
  remain: number
  items: {
    name: string
    total: number
    used: number
    remain: number
  }[]
}

export interface CheckinAllResult {
  results: {
    uid: string
    ok: boolean
    msg?: string
    remain?: number
    has_remain?: boolean
  }[]
}

export interface RefreshAllResult {
  busy: boolean
  total: number
  ok: number
  failed: number
}
