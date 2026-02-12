export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: string; details?: any };
export type ApiResp<T> = ApiOk<T> | ApiErr;

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const text = await res.text();

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `Non-JSON response from ${url} (status ${res.status}): ${text.slice(0, 120)}...`,
    );
  }

  const payload = parsed as ApiResp<T>;
  if (!payload.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload.data;
}
