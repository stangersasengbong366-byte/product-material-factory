const CLOUD_API_URL = import.meta.env.VITE_CLOUD_API_URL || "/api/studio-config";

export const cloudEnabled = true;
export const cloudProviderName = "Cloudflare";

export async function loadCloudStudio() {
  const response = await fetch(CLOUD_API_URL, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(await errorMessage(response, "Cloudflare 云端配置读取失败"));
  }
  const record = await response.json();
  return record?.payload
    ? { ...record.payload, updatedAt: record.updatedAt || null }
    : null;
}

export async function saveCloudStudio(payload) {
  const response = await fetch(CLOUD_API_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ...payload, version: Date.now() }),
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response, "Cloudflare 云端配置保存失败"));
  }
  return response.json();
}

async function errorMessage(response, fallback) {
  try {
    const detail = await response.json();
    return detail.message || detail.error || fallback;
  } catch {
    return fallback;
  }
}
