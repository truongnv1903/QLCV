export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    let message = "Không thể thực hiện yêu cầu. Vui lòng thử lại.";
    if (typeof data.detail === "string") message = data.detail;
    else if (Array.isArray(data.detail))
      message = data.detail
        .map((x: { msg?: string }) => x.msg || "Dữ liệu chưa hợp lệ")
        .join(". ");
    throw new ApiError(message, response.status);
  }
  return data as T;
}
