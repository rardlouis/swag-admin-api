import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiPost } from "../../api.js";
import "./Login.css";

const passwordIsValid = (value) => value.length >= 8 && value.length <= 64 && /[A-Z]/.test(value) && /\d/.test(value);

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!resendSeconds) return undefined;
    const timer = window.setInterval(() => setResendSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  const sendCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setError("Enter your registered administrator email."); return; }
    setError(""); setStatus(""); setLoading(true);
    try {
      const result = await apiPost("/auth/admin/password-reset/send", { email: normalizedEmail });
      setStep("otp"); setCode(""); setResendSeconds(Number(result.resendAfterSeconds ?? 60));
      setStatus(`A one-time code was sent to ${normalizedEmail}.`);
    } catch (cause) { setError(cause.message || "Unable to send the reset code."); }
    finally { setLoading(false); }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) { setError("Enter the complete 6-digit code."); return; }
    setError(""); setLoading(true);
    try {
      const result = await apiPost("/auth/admin/password-reset/verify", { email: email.trim().toLowerCase(), code });
      setVerificationId(result.verificationId); setStep("password"); setStatus("Code verified. Choose a new password.");
    } catch (cause) { setError(cause.message || "The code could not be verified."); }
    finally { setLoading(false); }
  };

  const completeReset = async (event) => {
    event.preventDefault();
    if (!passwordIsValid(password)) { setError("Password must be 8 to 64 characters and include an uppercase letter and number."); return; }
    if (password !== confirmPassword) { setError("Password confirmation does not match."); return; }
    setError(""); setLoading(true);
    try {
      await apiPost("/auth/admin/password-reset/complete", { email: email.trim().toLowerCase(), verificationId, password, confirmPassword });
      navigate("/login", { replace: true, state: { message: "Password reset successfully. Please sign in." } });
    } catch (cause) { setError(cause.message || "Unable to reset the password."); }
    finally { setLoading(false); }
  };

  const submit = step === "email" ? sendCode : step === "otp" ? verifyCode : completeReset;
  const title = step === "email" ? "Forgot password?" : step === "otp" ? "Verify your email" : "Choose a new password";
  return <div className="login-container"><div className="login-card"><div className="login-left"><div className="login-logo"><div className="logo-placeholder"><img src="/afro-logo.png" alt="A'FRO logo" /></div><span>A'FRO</span></div><h2 className="reset-title">{title}</h2><p className="reset-copy">{step === "email" ? "Enter the email registered to your administrator account." : step === "otp" ? `Enter the code sent to ${email.trim()}.` : "Your new password must be 8–64 characters and include an uppercase letter and number."}</p><form onSubmit={submit} className="login-form">{step === "email" && <><label>Administrator Email</label><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" autoComplete="email" /></>}{step === "otp" && <><label>6-digit verification code</label><input type="text" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" autoComplete="one-time-code" /><button className="reset-link-button" disabled={loading || resendSeconds > 0} onClick={sendCode} type="button">{resendSeconds ? `Resend in ${resendSeconds}s` : "Resend code"}</button></>}{step === "password" && <><label>New Password</label><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /><label>Confirm New Password</label><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></>}{status && <p className="reset-status">{status}</p>}{error && <p className="login-error">{error}</p>}<button disabled={loading} type="submit">{loading ? "Please wait..." : step === "email" ? "Send reset code" : step === "otp" ? "Verify code" : "Reset password"}</button></form><Link className="reset-back" to="/login">Back to sign in</Link></div><div className="login-right"><img className="login-mascot" src="/afro-logo.png" alt="A'FRO Dry Goods logo" /><h1>A'FRO<br />Dry Goods</h1><p>THRIFT · STYLE · COMMUNITY</p></div></div></div>;
}
