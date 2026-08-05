/** 统一解析 API 响应，并把 Failed to fetch 转成可读中文 */

export function networkErrorMessage(e: unknown, fallback: string) {
  if (e instanceof TypeError && /fetch|network|load failed/i.test(e.message)) {
    return "网络异常或服务无响应，请检查连接后重试";
  }
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export async function readJsonResponse(res: Response) {
  const text = await res.text();
  if (!text) return {} as Record<string, unknown>;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      res.ok ? "服务器返回了无法解析的响应" : `请求失败（${res.status}）`,
    );
  }
}
