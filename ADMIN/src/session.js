export function getStoredAdminUser() {
  const rawUser =
    sessionStorage.getItem("swag_admin_user") ||
    localStorage.getItem("swag_admin_user");

  if (!rawUser) return null;

  try {
    return JSON.parse(rawUser);
  } catch {
    return null;
  }
}

export function clearStoredAdminSession() {
  sessionStorage.removeItem("swag_admin_token");
  sessionStorage.removeItem("swag_admin_user");
  localStorage.removeItem("swag_admin_token");
  localStorage.removeItem("swag_admin_user");
}

export function setStoredAdminUser(user) {
  const storage = localStorage.getItem("swag_admin_token") ? localStorage : sessionStorage;
  storage.setItem("swag_admin_user", JSON.stringify(user));
}

export function getAdminDisplayName(user) {
  return user?.fullName || user?.full_name || user?.email || "Admin";
}

export function getAdminInitial(user) {
  return getAdminDisplayName(user).trim().charAt(0).toUpperCase() || "A";
}

export function getAdminPhotoUrl(user) {
  return user?.profilePhotoUrl || user?.profile_photo_url || "";
}

export function getAdminRole(user) {
  return user?.isAdmin || user?.is_admin ? "Admin" : "User";
}
