const CLOUD_API_URL =
  import.meta.env?.VITE_CLOUD_API_URL ||
  "https://youdao-course-material-storage.stangersasengbong366.workers.dev/api/studio-config";

export const cloudEnabled = true;
export const cloudProviderName = "Cloudflare";

export async function loadCloudStudio({ signal } = {}) {
  const response = await fetch(CLOUD_API_URL, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(await errorMessage(response, "Cloudflare 云端配置读取失败"));
  }
  const record = await response.json();
  return record?.payload
    ? {
        ...record.payload,
        updatedAt: record.updatedAt || null,
        revision: Number.isInteger(record.revision) ? record.revision : null,
      }
    : null;
}

export async function saveCloudStudio(payload, { signal, revision } = {}) {
  const requestSignal = signal || AbortSignal.timeout(30000);
  const body = JSON.stringify({ ...payload, version: Date.now() });
  try {
    let response = await putCloudStudio(body, revision, requestSignal);
    if (response.status === 409 && Number.isInteger(revision)) {
      const latest = await loadCloudStudio({ signal: requestSignal });
      response = await putCloudStudio(body, latest?.revision, requestSignal);
    }
    if (!response.ok) {
      throw new Error(await errorMessage(response, "Cloudflare 云端配置保存失败"));
    }
    return response.json();
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new Error("云端保存超时，请检查网络后重试");
    }
    throw error;
  }
}

function putCloudStudio(body, revision, signal) {
  return fetch(CLOUD_API_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(Number.isInteger(revision)
        ? { "X-Cloud-Revision": String(revision) }
        : {}),
    },
    body,
    signal,
  });
}

async function errorMessage(response, fallback) {
  try {
    const detail = await response.json();
    return detail.message || detail.error || fallback;
  } catch {
    return fallback;
  }
}
