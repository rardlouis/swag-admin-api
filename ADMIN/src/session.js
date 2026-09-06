export function normalizeAdminUser(user) {
  if (!user) return null;

  const source = user.user ?? user;

  return {
    ...source,
    id: source.id || source.user_id || source.userId,
    fullName: source.fullName || source.full_name || source.name || source.email || "Admin",
    profilePhotoUrl: source.profilePhotoUrl || source.profile_photo_url || "",
    idType: source.idType || source.id_type || "",
    idNumber: source.idNumber || source.id_number || "",
    isAdmin: source.isAdmin ?? source.is_admin ?? true,
    isActive: source.isActive ?? source.is_active ?? true,
  };
}

export function getStoredAdminUser() {
  const rawUser =
    sessionStorage.getItem("swag_admin_user") ||
    localStorage.getItem("swag_admin_user");

  if (!rawUser) return null;

  try {
    return normalizeAdminUser(JSON.parse(rawUser));
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

export function setStoredAdminUser(user, preferredStorage) {
  const storage =
    preferredStorage ||
    (localStorage.getItem("swag_admin_token") ? localStorage : sessionStorage);
  storage.setItem("swag_admin_user", JSON.stringify(normalizeAdminUser(user)));
}

export function getAdminDisplayName(user) {
  const adminUser = normalizeAdminUser(user);
  return adminUser?.fullName || adminUser?.email || "Admin";
}

export function getAdminInitial(user) {
  return getAdminDisplayName(user).trim().charAt(0).toUpperCase() || "A";
}

export function getAdminPhotoUrl(user) {
  return normalizeAdminUser(user)?.profilePhotoUrl || "";
}

export function getAdminRole(user) {
  return normalizeAdminUser(user)?.isAdmin ? "Admin" : "User";
}
