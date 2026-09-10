import type { ApiError } from "@/types"

const API_BASE = "/api"

class ApiClientError extends Error {
  status: number
  data: ApiError

  constructor(status: number, data: ApiError) {
    super(data.error || "Request failed")
    this.status = status
    this.data = data
  }
}

export { ApiClientError }

async function request<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const options: RequestInit | undefined =
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          credentials: "same-origin",
        }

  const res = await fetch(`${API_BASE}${path}`, options)

  const data = (await res.json().catch(() => ({}))) as ApiError

  if (!res.ok) {
    throw new ApiClientError(res.status, data)
  }

  return data as T
}

export const api = {
  getState: () => request<import("@/types").AppState>("/state"),

  loginStart: (channel: string) =>
    request<import("@/types").LoginStartResult>("/login/start", { channel }),

  loginCancel: () =>
    request<import("@/types").SimpleResult>("/login/cancel", {}),

  accountImport: (raw: string) =>
    request<import("@/types").ImportResult>("/account/import", { raw }),

  accountCheckin: (uid: string) =>
    request<import("@/types").SimpleResult>("/account/checkin", { uid }),

  accountCheckinAll: () =>
    request<import("@/types").SimpleResult>("/account/checkin_all", {}),

  accountRefresh: (uid: string) =>
    request<import("@/types").SimpleResult>("/account/refresh", { uid }),

  accountRefreshAll: () =>
    request<import("@/types").SimpleResult>("/account/refresh_all", {}),

  accountRemove: (uid: string) =>
    request<import("@/types").SimpleResult>("/account/remove", { uid }),

  accountDisable: (uid: string, disabled: boolean) =>
    request<import("@/types").SimpleResult>("/account/disable", {
      uid,
      disabled,
    }),

  accountResourceDetail: (uid: string) =>
    request<import("@/types").ResourceDetail>("/account/resource_detail", {
      uid,
    }),

  configApiKey: (key: string) =>
    request<import("@/types").SimpleResult>("/config/api_key", { key }),

  configCheckinTimes: (times: string[]) =>
    request<import("@/types").SimpleResult>("/config/checkin_times", {
      times,
    }),

  fees: () => request<import("@/types").FeesInfo>("/fees"),

  feesRefresh: () => request<import("@/types").SimpleResult>("/fees/refresh", {}),

  logs: () => request<import("@/types").LogsData>("/logs"),
}
