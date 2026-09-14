const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000/api";

function clearInvalidAdminSession() {
  sessionStorage.removeItem("swag_admin_token");
  sessionStorage.removeItem("swag_admin_user");
  localStorage.removeItem("swag_admin_token");
  localStorage.removeItem("swag_admin_user");
}

async function throwApiError(response, path) {
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

export async function apiGet(path) {
  const response = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() });

  if (!response.ok) {
    await throwApiError(response, path);
  }

  return response.json();
}

export async function apiDelete(path) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });

  if (!response.ok) {
    await throwApiError(response, path);
  }

  return response.json();
}

export async function apiPost(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
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
  const response = await fetch(`${API_BASE_URL}${path}`, {
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

  const response = await fetch(`${API_BASE_URL}${path}`, {
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

  const response = await fetch(`${API_BASE_URL}${path}`, {
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
  if (/^https?:\/\//i.test(url)) return url.replace("http://localhost:5000", API_BASE_URL.replace("/api", ""));
  return `${API_BASE_URL.replace("/api", "")}${url.startsWith("/") ? url : `/${url}`}`;
}
