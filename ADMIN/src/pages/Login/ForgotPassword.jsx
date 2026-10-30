import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AiOutlineEye, AiOutlineEyeInvisible } from "react-icons/ai";
import { apiPost } from "../../api.js";
import "./Login.css";

const passwordIsValid = (value) => value.length >= 8 && value.length <= 64 && /[A-Z]/.test(value) && /\d/.test(value);
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resetSessionId, setResetSessionId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!resendSeconds) return undefined;
    const timer = window.setInterval(() => setResendSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  const clearMessages = () => { setError(""); setStatus(""); };
  const sendCode = async (event) => {
    event?.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!validEmail(normalizedEmail)) return setError("Enter a valid administrator email address.");
    clearMessages(); setLoading(true);
    try {
      const result = await apiPost("/auth/admin/password-reset/send", { email: normalizedEmail });
      setEmail(normalizedEmail); setCode(""); setResendSeconds(Number(result.resendAfterSeconds ?? 60)); setStep("otp");
      setStatus("If an active administrator account matches this email, a verification code has been sent.");
    } catch (cause) { setError(cause.message || "Unable to send a verification code right now."); }
    finally { setLoading(false); }
  };
  const verifyCode = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError("Enter the complete 6-digit verification code.");
    clearMessages(); setLoading(true);
    try {
      const result = await apiPost("/auth/admin/password-reset/verify", { email, code });
      setResetSessionId(result.resetSessionId || result.verificationId || ""); setStep("password"); setStatus("Code verified. Choose a new password.");
    } catch (cause) { setError(cause.message || "The verification code could not be verified."); }
    finally { setLoading(false); }
  };
  const completeReset = async (event) => {
    event.preventDefault();
    if (!resetSessionId) { setStep("email"); return setError("Verify a new code before setting your password."); }
    if (!passwordIsValid(password)) return setError("Password must be 8–64 characters and include an uppercase letter and number.");
    if (password !== confirmPassword) return setError("Password confirmation does not match.");
    clearMessages(); setLoading(true);
    try {
      await apiPost("/auth/admin/password-reset/complete", { email, resetSessionId, password, confirmPassword });
      navigate("/login", { replace: true, state: { message: "Password reset successfully. Please sign in." } });
    } catch (cause) { setError(cause.message || "Unable to reset the password."); }
    finally { setLoading(false); }
  };

  const submit = step === "email" ? sendCode : step === "otp" ? verifyCode : completeReset;
  const title = step === "email" ? "Forgot password?" : step === "otp" ? "Verify your email" : "Create a new password";
  const copy = step === "email" ? "Enter the email registered to your administrator account." : step === "otp" ? "Enter the 6-digit code from your email to continue." : "Use 8–64 characters with at least one uppercase letter and one number.";
  return <div className="login-container reset-page"><main className="login-card reset-card"><section className="login-left" aria-labelledby="reset-title"><div className="login-logo"><div className="logo-placeholder"><img src="/afro-logo.png" alt="A'FRO logo" /></div><span>A'FRO</span></div><div className="reset-heading"><span className="reset-step">Step {step === "email" ? "1" : step === "otp" ? "2" : "3"} of 3</span><h1 id="reset-title" className="reset-title">{title}</h1><p className="reset-copy">{copy}</p></div><form onSubmit={submit} className="login-form reset-form" noValidate>{step === "email" && <label className="form-field"><span>Administrator Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" autoComplete="email" aria-describedby="reset-message" disabled={loading} autoFocus /></label>}{step === "otp" && <><label className="form-field"><span>6-digit verification code</span><input className="otp-input" type="text" inputMode="numeric" pattern="[0-9]*" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" autoComplete="one-time-code" disabled={loading} autoFocus /></label><button className="reset-link-button" disabled={loading || resendSeconds > 0} onClick={sendCode} type="button">{resendSeconds ? `Resend available in ${resendSeconds}s` : "Resend verification code"}</button></>}{step === "password" && <><label className="form-field"><span>New Password</span><div className="password-wrapper"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" disabled={loading} autoFocus /><button type="button" className="password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <AiOutlineEyeInvisible /> : <AiOutlineEye />}</button></div></label><label className="form-field"><span>Confirm New Password</span><div className="password-wrapper"><input type={showConfirmation ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" disabled={loading} /><button type="button" className="password-toggle" aria-label={showConfirmation ? "Hide password" : "Show password"} onClick={() => setShowConfirmation((value) => !value)}>{showConfirmation ? <AiOutlineEyeInvisible /> : <AiOutlineEye />}</button></div></label></>}{(status || error) && <p id="reset-message" className={error ? "reset-message error" : "reset-message success"} role={error ? "alert" : "status"}>{error || status}</p>}<button className="reset-primary-button" disabled={loading} type="submit">{loading ? "Please wait…" : step === "email" ? "Send Reset Code" : step === "otp" ? "Verify Code" : "Reset Password"}</button></form><Link className="reset-back" to="/login">Back to Sign In</Link></section><aside className="login-right" aria-label="A'FRO Dry Goods"><img className="login-mascot" src="/afro-logo.png" alt="" /><h2>A'FRO<br />Dry Goods</h2><p>Thrift · Style · Community</p></aside></main></div>;
}
