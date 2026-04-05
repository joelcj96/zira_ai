import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { useToast } from "../context/ToastContext";

function LoginPage() {
  const { token, login, register, googleLogin } = useAuth();
  const { t } = useI18n();
  const { showToast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [googleForm, setGoogleForm] = useState({ email: "", name: "" });

  if (token) {
    return <Navigate to="/" replace />;
  }

  const onChange = (event) => {
    setForm((previous) => ({ ...previous, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      if (isRegisterMode) {
        await register(form.name, form.email, form.password);
      } else {
        await login(form.email, form.password);
      }
    } catch (err) {
      showToast(err.response?.data?.message || t("login.authFailed"), "danger");
    }
  };

  const handleGoogleLogin = async (e) => {
    e?.preventDefault();
    setShowGoogleModal(true);
  };

  const handleGoogleSubmit = async (e) => {
    e.preventDefault();
    if (!googleForm.email || !googleForm.name) {
      showToast("Please fill in both email and name", "info");
      return;
    }
    try {
      await googleLogin(googleForm.email, googleForm.name);
      setShowGoogleModal(false);
      setGoogleForm({ email: "", name: "" });
    } catch (err) {
      showToast(err.response?.data?.message || t("login.googleFailed"), "danger");
    }
  };

  return (
    <div className="auth-page">
      <div className="logo-corner">Z</div>
      
      {/* 3D Animated Background */}
      <div className="bg-sphere" style={{ "--delay": "0s" }}></div>
      <div className="bg-sphere" style={{ "--delay": "2s" }}></div>
      <div className="bg-sphere" style={{ "--delay": "4s" }}></div>
      <div className="bg-grid"></div>
      
      <div className="auth-card">
        <div className="auth-header">
          <h1>{t("app.name")}</h1>
          <p className="auth-subtitle">{t("login.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit}>
          {isRegisterMode && (
            <input
              name="name"
              value={form.name}
              onChange={onChange}
              placeholder={t("login.fullName")}
              required
            />
          )}
          <input
            name="email"
            value={form.email}
            onChange={onChange}
            placeholder={t("login.email")}
            type="email"
            required
          />
          <div className="password-wrapper">
            <input
              name="password"
              value={form.password}
              onChange={onChange}
              placeholder={t("login.password")}
              type={showPassword ? "text" : "password"}
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((prev) => !prev)}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "👁️" : "👁️‍🗨️"}
            </button>
          </div>

          <button type="submit">{isRegisterMode ? t("login.createAccount") : t("login.signIn")}</button>
        </form>

        <button className="secondary" onClick={handleGoogleLogin}>
          {t("login.continueGoogle")}
        </button>

        <button className="link" onClick={() => setIsRegisterMode((value) => !value)}>
          {isRegisterMode ? t("login.hasAccount") : t("login.newHere")}
        </button>

        {showGoogleModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h2>Sign in with Google</h2>
              <form onSubmit={handleGoogleSubmit}>
                <input
                  type="email"
                  placeholder="Email"
                  value={googleForm.email}
                  onChange={(e) => setGoogleForm((prev) => ({ ...prev, email: e.target.value }))}
                  required
                />
                <input
                  type="text"
                  placeholder="Full Name"
                  value={googleForm.name}
                  onChange={(e) => setGoogleForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
                <div className="modal-buttons">
                  <button type="submit">Continue</button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setShowGoogleModal(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LoginPage;
