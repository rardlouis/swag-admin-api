const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, "");
const API_BASE_URL = configuredApiUrl
  ? configuredApiUrl.endsWith("/api")
    ? configuredApiUrl
    : `${configuredApiUrl}/api`
  : "";
const API_ORIGIN = API_BASE_URL.replace(/\/api$/, "");
const REQUEST_TIMEOUT_MS = 15_000;
export const SERVER_UNAVAILABLE_MESSAGE = "Server unavailable, please try again later.";

export class ServerUnavailableError extends Error {
  constructor() {
    super(SERVER_UNAVAILABLE_MESSAGE);
    this.name = "ServerUnavailableError";
  }
}

export function isServerUnavailableError(error) {
  return error instanceof ServerUnavailableError;
}

function clearInvalidAdminSession() {
  sessionStorage.removeItem("swag_admin_token");
  sessionStorage.removeItem("swag_admin_user");
  localStorage.removeItem("swag_admin_token");
  localStorage.removeItem("swag_admin_user");
}

async function throwApiError(response, path) {
  if ([502, 503, 504].includes(response.status)) {
    throw new ServerUnavailableError();
  }
  const error = await response.json().catch(() => null);
  const message = Array.isArray(error?.message)
    ? error.message.join(" ")
    : error?.message ?? `API request failed: ${response.status}`;

  // Login itself is allowed to return 401 for invalid credentials. Every other
  // 401 means the stored admin session is no longer usable (for example, the
  // JWT expired or JWT_SECRET was changed), so prevent stale data screens.
  if (response.status === 401 && path !== "/auth/login") {
    clearInvalidAdminSession();
    if (window.location.pathname !== "/login") {
      window.location.replace("/login");
    }
  }

  throw new Error(message);
}

function authHeaders(headers = {}) {
  const token = sessionStorage.getItem("swag_admin_token") || localStorage.getItem("swag_admin_token");
  return { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function fetchApi(path, options = {}) {
  if (!API_BASE_URL) throw new ServerUnavailableError();
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new ServerUnavailableError();
    }
    throw new ServerUnavailableError();
  }
}

export async function apiGet(path) {
  const response = await fetchApi(path, { headers: authHeaders() });

  if (!response.ok) {
    await throwApiError(response, path);
  }

  return response.json();
}

export async function apiDelete(path) {
  const response = await fetchApi(path, {
    method: "DELETE",
    headers: authHeaders(),
  });

  if (!response.ok) {
    await throwApiError(response, path);
  }

  return response.json();
}

export async function apiPost(path, body) {
  const response = await fetchApi(path, {
    method: "POST",
    headers: authHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await throwApiError(response, path);
  }

  return response.json();
}

export async function apiPatch(path, body) {
  const response = await fetchApi(path, {
    method: "PATCH",
    headers: authHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await throwApiError(response, path);
  }

  return response.json();
}

export async function apiUpload(path, files) {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append("images", file);
  });

  const response = await fetchApi(path, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });

  if (!response.ok) {
    await throwApiError(response, path);
  }

  return response.json();
}

export async function apiUploadOne(path, fieldName, file) {
  const formData = new FormData();
  formData.append(fieldName, file);

  const response = await fetchApi(path, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });

  if (!response.ok) {
    await throwApiError(response, path);
  }

  return response.json();
}

export function formatPeso(value) {
  return `₱${Number(value ?? 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(value, options = {}) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-PH", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    ...options,
  }).format(new Date(value));
}

export function imageUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) {
    const parsed = new URL(url);
    return `${API_ORIGIN}${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  return `${API_ORIGIN}${url.startsWith("/") ? url : `/${url}`}`;
}

export async function apiDownload(path, filename) {
  const response = await fetchApi(path, { headers: authHeaders() });

  if (!response.ok) {
    await throwApiError(response, path);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
