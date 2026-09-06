import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AiOutlineEye, AiOutlineEyeInvisible } from "react-icons/ai";
import { apiPost } from "../../api.js";
import { setStoredAdminUser } from "../../session.js";
import "./Login.css";

export default function Login() {
  const navigate = useNavigate();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const session = await apiPost("/auth/login", { login, password });
      const storage = remember ? localStorage : sessionStorage;

      storage.setItem("swag_admin_token", session.token);
      setStoredAdminUser(session.user, storage);
      window.dispatchEvent(new Event("swag_admin_user_updated"));
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Left Side */}
        <div className="login-left">
          <div className="login-logo">
            <div className="logo-placeholder">
              <img src="/afro-logo.png" alt="A'FRO logo" />
            </div>
            <span>A'FRO</span>
          </div>

          <form onSubmit={handleLogin} className="login-form">
            <label>Username or Email</label>
            <input
              type="text"
              placeholder="Enter username or email"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              required
            />

            <label>Password</label>
            <div className="password-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Input password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
                <span onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <AiOutlineEyeInvisible size={18} /> : <AiOutlineEye size={18} />}
                </span>
            </div>

            <div className="login-options">
              <label>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={() => setRemember(!remember)}
                />
                Remember me?
              </label>
              <a href="#">Forgot Password</a>
            </div>

            {error && <p className="login-error">{error}</p>}

            <button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Signing In..." : "Sign In"}
            </button>
          </form>
        </div>

        {/* Right Side */}
        <div className="login-right">
          <img className="login-mascot" src="/afro-logo.png" alt="A'FRO Dry Goods logo" />
          <h1>A'FRO<br />Dry Goods</h1>
          <p>THRIFT · STYLE · COMMUNITY</p>
        </div>
      </div>
    </div>
  );
}
