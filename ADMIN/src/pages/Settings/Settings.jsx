import { useMemo, useState } from "react";
import {
  MdAdminPanelSettings,
  MdBadge,
  MdNotifications,
  MdNotificationsActive,
  MdNotificationsOff,
  MdLock,
  MdMail,
  MdPerson,
  MdPhone,
  MdSave,
  MdSecurity,
  MdPhotoCamera,
  MdToggleOff,
  MdToggleOn,
} from "react-icons/md";
import { apiPatch, apiUploadOne } from "../../api.js";
import { getAdminDisplayName, getAdminInitial, getAdminPhotoUrl, getAdminRole, getStoredAdminUser, setStoredAdminUser } from "../../session.js";
import "./Settings.css";

const buildInitialSettings = (user) => ({
  fullName: getAdminDisplayName(user),
  email: user?.email || "",
  phone: user?.phone || "",
  idType: user?.idType || "PhilSys",
  idNumber: user?.idNumber || "",
  role: getAdminRole(user),
  isActive: user?.isActive ?? user?.is_active ?? true,
  isAdmin: user?.isAdmin ?? user?.is_admin ?? true,
  allowNotifications: false,
  password: "",
  confirmPassword: "",
});

const idTypes = [
  "PhilSys",
  "Driver's License",
  "Passport",
  "SSS",
  "GSIS",
  "PhilHealth",
  "Voter's ID",
  "TIN",
];

export default function Settings() {
  const adminUser = getStoredAdminUser();
  const initialSettings = useMemo(() => buildInitialSettings(adminUser), [adminUser]);
  const [settings, setSettings] = useState(initialSettings);
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [saveStatus, setSaveStatus] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );

  const updateField = (field, value) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaveStatus("");
    setSaveError("");

    if (!adminUser?.id) {
      setSaveError("No logged-in admin session found. Please log in again.");
      return;
    }

    if (settings.password && settings.password !== settings.confirmPassword) {
      setSaveError("Passwords do not match.");
      return;
    }

    setIsSaving(true);

    try {
      const updatedUser = await apiPatch(`/admin/profile/${adminUser.id}`, settings);
      setStoredAdminUser(updatedUser);
      setSettings({
        ...buildInitialSettings(updatedUser),
        allowNotifications: settings.allowNotifications,
      });
      setSaveStatus("Changes saved.");
      window.dispatchEvent(new Event("swag_admin_user_updated"));
    } catch (err) {
      setSaveError(err.message || "Unable to save changes.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleProfilePhotoChange = async (file) => {
    if (!file) return;
    setProfilePhoto(URL.createObjectURL(file));
    setSaveStatus("");
    setSaveError("");

    if (!adminUser?.id) {
      setSaveError("No logged-in admin session found. Please log in again.");
      return;
    }

    setIsUploadingPhoto(true);

    try {
      const updatedUser = await apiUploadOne(`/admin/profile/${adminUser.id}/photo`, "photo", file);
      setStoredAdminUser(updatedUser);
      setSettings({
        ...buildInitialSettings(updatedUser),
        allowNotifications: settings.allowNotifications,
      });
      setProfilePhoto(null);
      setSaveStatus("Profile photo updated.");
      window.dispatchEvent(new Event("swag_admin_user_updated"));
    } catch (err) {
      setSaveError(err.message || "Unable to upload profile photo.");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleNotificationToggle = async () => {
    if (typeof Notification === "undefined") {
      setNotificationStatus("unsupported");
      return;
    }

    if (settings.allowNotifications) {
      updateField("allowNotifications", false);
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationStatus(permission);
    updateField("allowNotifications", permission === "granted");
  };

  return (
    <div className="settings-page">
      <div className="settings-header">
        <div>
          <h1>Account & Settings</h1>
          <p>
            Dashboard <span>›</span> <strong>Account & Settings</strong>
          </p>
        </div>
      </div>

      <form className="settings-layout" onSubmit={handleSubmit}>
        <section className="settings-card settings-profile-card">
          <div className="settings-card-head">
            <h2>Admin Profile</h2>
            <p>Manage your admin account details.</p>
          </div>

          <div className="settings-profile-summary">
            <label className="settings-avatar-upload">
              {profilePhoto ? (
                <img src={profilePhoto} alt="Profile preview" />
              ) : getAdminPhotoUrl(adminUser) ? (
                <img src={getAdminPhotoUrl(adminUser)} alt="Profile" />
              ) : (
                <div className="settings-avatar">{getAdminInitial(adminUser)}</div>
              )}
              <input
                accept="image/png,image/jpeg,image/webp"
                disabled={isUploadingPhoto}
                onChange={(e) => handleProfilePhotoChange(e.target.files?.[0])}
                type="file"
              />
              <span><MdPhotoCamera size={14} /></span>
            </label>
            <div>
              <strong>{settings.fullName}</strong>
              <span>{settings.email}</span>
              <label className="settings-change-photo-btn">
                {isUploadingPhoto ? "Uploading photo..." : "Change profile photo"}
                <input
                  accept="image/png,image/jpeg,image/webp"
                  disabled={isUploadingPhoto}
                  onChange={(e) => handleProfilePhotoChange(e.target.files?.[0])}
                  type="file"
                />
              </label>
            </div>
          </div>

          <label className="settings-field">
            <span><MdPerson size={15} /> Full Name</span>
            <input
              value={settings.fullName}
              onChange={(e) => updateField("fullName", e.target.value)}
            />
          </label>

          <label className="settings-field">
            <span><MdMail size={15} /> Email</span>
            <input
              type="email"
              value={settings.email}
              onChange={(e) => updateField("email", e.target.value)}
            />
          </label>

          <label className="settings-field">
            <span><MdPhone size={15} /> Phone</span>
            <input
              value={settings.phone}
              onChange={(e) => updateField("phone", e.target.value)}
            />
          </label>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <h2>Identity</h2>
            <p>Uses ID_TYPES with USERS.id_type_id and id_number.</p>
          </div>

          <label className="settings-field">
            <span><MdBadge size={15} /> ID Type</span>
            <select value={settings.idType} onChange={(e) => updateField("idType", e.target.value)}>
              {idTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            <span><MdBadge size={15} /> ID Number</span>
            <input
              value={settings.idNumber}
              onChange={(e) => updateField("idNumber", e.target.value)}
            />
          </label>

          <div className="settings-toggle-list">
            <button
              className={`settings-toggle ${settings.isActive ? "active" : ""}`}
              onClick={() => updateField("isActive", !settings.isActive)}
              type="button"
            >
              {settings.isActive ? <MdToggleOn size={28} /> : <MdToggleOff size={28} />}
              <span>Account Active</span>
            </button>

            <div className="settings-role-card">
              <MdAdminPanelSettings size={22} />
              <div>
                <span>Account Role</span>
                <strong>{settings.role}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <h2>Security</h2>
            <p>Leave password fields blank to keep your current password.</p>
          </div>

          <label className="settings-field">
            <span><MdLock size={15} /> New Password</span>
            <input
              type="password"
              value={settings.password}
              onChange={(e) => updateField("password", e.target.value)}
              placeholder="Enter new password"
            />
          </label>

          <label className="settings-field">
            <span><MdSecurity size={15} /> Confirm Password</span>
            <input
              type="password"
              value={settings.confirmPassword}
              onChange={(e) => updateField("confirmPassword", e.target.value)}
              placeholder="Confirm new password"
            />
          </label>

          <div className="settings-security-note">
            Password changes are saved only when both fields match.
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <h2>Notifications</h2>
            <p>Allow browser notifications for chats, orders, and customer updates.</p>
          </div>

          <div className="settings-notification-panel">
            <div className="settings-notification-icon">
              {settings.allowNotifications ? (
                <MdNotificationsActive size={24} />
              ) : (
                <MdNotificationsOff size={24} />
              )}
            </div>

            <div>
              <strong>Admin Notifications</strong>
              <span>
                Browser permission:{" "}
                {notificationStatus === "default" ? "Not asked yet" : notificationStatus}
              </span>
            </div>

            <button
              className={`settings-notification-toggle ${settings.allowNotifications ? "active" : ""}`}
              onClick={handleNotificationToggle}
              type="button"
            >
              <MdNotifications size={18} />
              {settings.allowNotifications ? "Allowed" : "Allow"}
            </button>
          </div>

          <div className="settings-notification-options">
            <label>
              <input checked={settings.allowNotifications} readOnly type="checkbox" />
              New chat messages
            </label>
            <label>
              <input checked={settings.allowNotifications} readOnly type="checkbox" />
              New orders
            </label>
            <label>
              <input checked={settings.allowNotifications} readOnly type="checkbox" />
              Customer verification requests
            </label>
          </div>
        </section>

        <div className="settings-bottom-actions">
          {(saveStatus || saveError) && (
            <p className={saveError ? "settings-save-message error" : "settings-save-message"}>
              {saveError || saveStatus}
            </p>
          )}
          <button className="settings-reset-btn" onClick={() => setSettings(initialSettings)} type="button">
            Reset
          </button>
          <button className="settings-save-btn" disabled={isSaving} type="submit">
            <MdSave size={17} />
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
