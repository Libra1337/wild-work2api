// api.ts — wild-work 管理 API 客户端（/api/*，同源）
export type Channel = "workbuddy" | "traework" | "qoder";

export interface AccountView {
  uid: string;
  group: Channel;
  nickname: string;
  credits: number;
  cooling: boolean;
  until: string;
  reason: string;
  disabled: boolean;
  err_count: number;
  last_checkin_ok: boolean;
  last_checkin_at: string;
  last_checkin_msg: string;
}

export interface AppState {
  accounts: AccountView[];
  checkin_times: string[];
  keepalive_hours: number[];
  listen_host: string;
  listen_port: number;
  api_key: string;
  login_busy: boolean;
  next_checkin: string;
  version: string;
  autostart: boolean;
  running: boolean;
}

export interface FeeModel {
  model: string;
  rate: string;
  note: string;
}

export interface FeesInfo {
  note: string;
  disclaimer: string;
  cached_at: string;
  error?: string;
  channels: { channel: Channel; models: FeeModel[] }[];
}

export interface ResourceDetail {
  [key: string]: unknown;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T = unknown>(
  path: string,
  body?: unknown,
): Promise<T> {
  const resp = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await resp.json().catch(() => ({}))) as { error?: string };
  if (!resp.ok) {
    throw new ApiError(resp.status, data.error || `HTTP ${resp.status}`);
  }
  return data as T;
}

export const fetcher = <T,>(path: string): Promise<T> => api<T>(path);

export const CHANNEL_LABEL: Record<Channel, string> = {
  workbuddy: "WorkBuddy",
  traework: "TraeWork",
  qoder: "Qoder",
};

export const CHANNELS: Channel[] = ["workbuddy", "traework", "qoder"];
