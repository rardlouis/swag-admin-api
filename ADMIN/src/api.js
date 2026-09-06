const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000/api";

export async function apiGet(path) {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json();
}

export async function apiDelete(path) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json();
}

export async function apiPost(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message ?? `API request failed: ${response.status}`);
  }

  return response.json();
}

export async function apiPatch(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message ?? `API request failed: ${response.status}`);
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
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message ?? `Upload failed: ${response.status}`);
  }

  return response.json();
}

export async function apiUploadOne(path, fieldName, file) {
  const formData = new FormData();
  formData.append(fieldName, file);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message ?? `Upload failed: ${response.status}`);
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
