const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const TABLE = "benefit_configs";
const CONFIG_ID = "course_material_studio_v1";

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export async function loadCloudStudio() {
  if (!cloudEnabled) return null;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${CONFIG_ID}&select=payload,updated_at`, {
    headers: headers(),
  });
  if (!response.ok) throw new Error(await errorMessage(response, "云端配置读取失败"));
  const [record] = await response.json();
  return record?.payload ? { ...record.payload, updatedAt: record.updated_at } : null;
}

export async function saveCloudStudio(payload) {
  if (!cloudEnabled) throw new Error("Supabase 环境变量未配置");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=id`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: CONFIG_ID, payload: { ...payload, version: Date.now() }, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(await errorMessage(response, "云端配置保存失败"));
  return true;
}

function headers() {
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
}

async function errorMessage(response, fallback) {
  try { const detail = await response.json(); return detail.message || detail.hint || fallback; }
  catch { return fallback; }
}
