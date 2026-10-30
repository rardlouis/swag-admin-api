import { useEffect, useState } from "react";
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
import { apiGet, apiPatch, apiPost, apiUploadOne } from "../../api.js";
import { getAdminDisplayName, getAdminInitial, getAdminPhotoUrl, getAdminRole, getStoredAdminUser, setStoredAdminUser } from "../../session.js";
import "./Settings.css";

const buildInitialSettings = (user) => ({
  username: user?.username || "",
  fullName: getAdminDisplayName(user),
  email: user?.email || "",
  phone: user?.phone || "",
  idType: user?.idType || "",
  idNumber: user?.idNumber || "",
  role: getAdminRole(user),
  isActive: user?.isActive ?? user?.is_active ?? true,
  isAdmin: user?.isAdmin ?? user?.is_admin ?? true,
  // This is a browser permission, not an account setting stored by the API.
  allowNotifications: typeof Notification !== "undefined" && Notification.permission === "granted",
});

export default function Settings() {
  const [adminUser, setAdminUser] = useState(getStoredAdminUser());
  const [settings, setSettings] = useState(() => buildInitialSettings(getStoredAdminUser()));
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [saveStatus, setSaveStatus] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  const [idTypes, setIdTypes] = useState([]);
  const [newAdmin, setNewAdmin] = useState({ username: "", fullName: "", email: "", phone: "", idType: "", idNumber: "", password: "", confirmPassword: "" });
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", password: "", confirmPassword: "" });
  const [passwordStep, setPasswordStep] = useState("current");
  const [passwordOtp, setPasswordOtp] = useState("");
  const [passwordResetSessionId, setPasswordResetSessionId] = useState("");
  const [passwordResendSeconds, setPasswordResendSeconds] = useState(0);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    apiGet("/admin/id-types").then(setIdTypes).catch(() => setIdTypes([]));
  }, []);

  useEffect(() => {
    let active = true;
    apiGet("/admin/profile/me")
      .then((profile) => {
        if (!active) return;
        setStoredAdminUser(profile);
        setAdminUser(profile);
        setSettings(buildInitialSettings(profile));
        window.dispatchEvent(new Event("swag_admin_user_updated"));
      })
      .catch((err) => {
        if (active) setSaveError(err.message || "Unable to load your administrator account.");
      })
      .finally(() => { if (active) setIsLoadingProfile(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!passwordResendSeconds) return undefined;
    const timer = window.setInterval(() => setPasswordResendSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [passwordResendSeconds]);

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

    setIsSaving(true);

    try {
      const updatedUser = await apiPatch(`/admin/profile/${adminUser.id}`, {
        username: settings.username,
        fullName: settings.fullName,
        email: settings.email,
        phone: settings.phone,
        idType: settings.idType,
        idNumber: settings.idNumber,
      });
      setStoredAdminUser(updatedUser);
      setAdminUser(updatedUser);
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
      setAdminUser(updatedUser);
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

  const requestPasswordOtp = async () => {
    if (!passwordForm.currentPassword) { setSaveError("Enter your current password."); return; }
    setSaveStatus(""); setSaveError(""); setIsChangingPassword(true);
    try {
      const result = await apiPost("/admin/password/change/send", { currentPassword: passwordForm.currentPassword });
      setPasswordOtp(""); setPasswordStep("otp"); setPasswordResendSeconds(Number(result.resendAfterSeconds ?? 60));
      setSaveStatus("A verification code was sent to your current registered email address.");
    } catch (err) { setSaveError(err.message || "Unable to send the verification code."); }
    finally { setIsChangingPassword(false); }
  };

  const verifyPasswordOtp = async () => {
    if (!/^\d{6}$/.test(passwordOtp)) { setSaveError("Enter the complete 6-digit code."); return; }
    setSaveStatus(""); setSaveError(""); setIsChangingPassword(true);
    try {
      const result = await apiPost("/admin/password/change/verify", { code: passwordOtp });
      setPasswordResetSessionId(result.resetSessionId || result.verificationId); setPasswordStep("new");
      setSaveStatus("Code verified. Choose your new password.");
    } catch (err) { setSaveError(err.message || "The verification code could not be verified."); }
    finally { setIsChangingPassword(false); }
  };

  const changePassword = async () => {
    setSaveStatus("");
    setSaveError("");
    if (passwordForm.password !== passwordForm.confirmPassword) {
      setSaveError("Passwords do not match.");
      return;
    }
    setIsChangingPassword(true);
    try {
      await apiPost("/admin/password/change", { resetSessionId: passwordResetSessionId, password: passwordForm.password, confirmPassword: passwordForm.confirmPassword });
      sessionStorage.removeItem("swag_admin_token");
      sessionStorage.removeItem("swag_admin_user");
      localStorage.removeItem("swag_admin_token");
      localStorage.removeItem("swag_admin_user");
      window.location.replace("/login");
    } catch (err) {
      setSaveError(err.message || "Unable to change password.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const createAdmin = async (event) => {
    event.preventDefault();
    setSaveStatus("");
    setSaveError("");
    setCreatingAdmin(true);
    try {
      const created = await apiPost("/admin/admins", newAdmin);
      setNewAdmin({ username: "", fullName: "", email: "", phone: "", idType: "", idNumber: "", password: "", confirmPassword: "" });
      setSaveStatus(`${created.fullName} can now sign in as an administrator.`);
    } catch (err) {
      setSaveError(err.message || "Could not create the administrator.");
    } finally {
      setCreatingAdmin(false);
    }
  };

  if (isLoadingProfile) return <div className="settings-page"><p>Loading account settings…</p></div>;

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
            <span><MdBadge size={15} /> Username</span>
            <input
              value={settings.username}
              onChange={(e) => updateField("username", e.target.value)}
              placeholder="3–64 letters, numbers, . _ or -"
              autoComplete="username"
            />
          </label>

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
            <p>Keep the identity details associated with your administrator account up to date.</p>
          </div>

          <label className="settings-field">
            <span><MdBadge size={15} /> ID Type</span>
            <select value={settings.idType} onChange={(e) => updateField("idType", e.target.value)}>
              <option value="">Select ID type</option>
              {idTypes.map((type) => (
                <option key={type.id} value={type.label}>{type.label}</option>
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
            <div className={`settings-toggle ${settings.isActive ? "active" : ""}`}>
              {settings.isActive ? <MdToggleOn size={28} /> : <MdToggleOff size={28} />}
              <span>Account Active</span>
            </div>

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
          <div className="settings-card-head"><h2>Administrator Management</h2><p>Create an additional administrator account. This access is protected server-side.</p></div>
          <div className="settings-field"><span><MdBadge size={15} /> Username</span><input value={newAdmin.username} onChange={(e) => setNewAdmin((current) => ({ ...current, username: e.target.value }))} autoComplete="username" /></div>
          <div className="settings-field"><span><MdPerson size={15} /> Full Name</span><input value={newAdmin.fullName} onChange={(e) => setNewAdmin((current) => ({ ...current, fullName: e.target.value }))} /></div>
          <div className="settings-field"><span><MdMail size={15} /> Email</span><input type="email" value={newAdmin.email} onChange={(e) => setNewAdmin((current) => ({ ...current, email: e.target.value }))} /></div>
          <div className="settings-field"><span><MdPhone size={15} /> Phone</span><input value={newAdmin.phone} onChange={(e) => setNewAdmin((current) => ({ ...current, phone: e.target.value }))} /></div>
          <div className="settings-field"><span><MdBadge size={15} /> ID Type</span><select value={newAdmin.idType} onChange={(e) => setNewAdmin((current) => ({ ...current, idType: e.target.value }))}><option value="">No ID type</option>{idTypes.map((type) => <option key={type.id} value={type.label}>{type.label}</option>)}</select></div>
          <div className="settings-field"><span><MdBadge size={15} /> ID Number</span><input value={newAdmin.idNumber} onChange={(e) => setNewAdmin((current) => ({ ...current, idNumber: e.target.value }))} /></div>
          <div className="settings-field"><span><MdLock size={15} /> Temporary Password</span><input type="password" value={newAdmin.password} onChange={(e) => setNewAdmin((current) => ({ ...current, password: e.target.value }))} /></div>
          <div className="settings-field"><span><MdSecurity size={15} /> Confirm Password</span><input type="password" value={newAdmin.confirmPassword} onChange={(e) => setNewAdmin((current) => ({ ...current, confirmPassword: e.target.value }))} /></div>
          <button className="settings-save-btn" disabled={creatingAdmin} type="button" onClick={createAdmin}>{creatingAdmin ? "Creating..." : "Create Administrator"}</button>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <h2>Security</h2>
            <p>Confirm your current password, then verify the code sent to your registered email.</p>
          </div>

          {passwordStep === "current" && <label className="settings-field">
            <span><MdLock size={15} /> Current Password</span>
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm((current) => ({ ...current, currentPassword: e.target.value }))}
              placeholder="Enter current password"
            />
          </label>}

          {passwordStep === "otp" && <>
            <label className="settings-field">
              <span><MdSecurity size={15} /> 6-digit verification code</span>
              <input inputMode="numeric" value={passwordOtp} onChange={(e) => setPasswordOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" autoComplete="one-time-code" />
            </label>
            <button className="settings-reset-btn" disabled={isChangingPassword || passwordResendSeconds > 0} type="button" onClick={requestPasswordOtp}>
              {passwordResendSeconds ? `Resend in ${passwordResendSeconds}s` : "Resend code"}
            </button>
          </>}

          {passwordStep === "new" && <>
          <label className="settings-field">
            <span><MdLock size={15} /> New Password</span>
            <input
              type="password"
              value={passwordForm.password}
              onChange={(e) => setPasswordForm((current) => ({ ...current, password: e.target.value }))}
              placeholder="8–64 characters, uppercase letter, and number"
            />
          </label>

          <label className="settings-field">
            <span><MdSecurity size={15} /> Confirm New Password</span>
            <input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm((current) => ({ ...current, confirmPassword: e.target.value }))} placeholder="Confirm new password" />
          </label>
          </>}

          <div className="settings-security-note">
            Your new password must be 8–64 characters and include an uppercase letter and number.
          </div>
          <button className="settings-save-btn" disabled={isChangingPassword} type="button" onClick={passwordStep === "current" ? requestPasswordOtp : passwordStep === "otp" ? verifyPasswordOtp : changePassword}>
            {isChangingPassword ? "Please wait..." : passwordStep === "current" ? "Send verification code" : passwordStep === "otp" ? "Verify code" : "Change Password"}
          </button>
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
          <button className="settings-reset-btn" onClick={() => setSettings(buildInitialSettings(adminUser))} type="button">
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
