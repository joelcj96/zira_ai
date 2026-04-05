import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "../pages/LoginPage.jsx";

const authMock = {
  token: null,
  login: vi.fn(),
  register: vi.fn(),
  googleLogin: vi.fn()
};

vi.mock("../context/AuthContext", () => ({
  useAuth: () => authMock
}));

const tMap = {
  "app.name": "Zira AI",
  "login.subtitle": "Subtitle",
  "login.fullName": "Full name",
  "login.email": "Email",
  "login.password": "Password",
  "login.createAccount": "Create account",
  "login.signIn": "Sign in",
  "login.continueGoogle": "Continue with Google",
  "login.hasAccount": "Already have an account? Sign in",
  "login.newHere": "New here? Create account",
  "login.authFailed": "Authentication failed",
  "login.googleFailed": "Google failed",
  "login.promptGoogleEmail": "Prompt email",
  "login.promptGoogleName": "Prompt name"
};

vi.mock("../context/I18nContext", () => ({
  useI18n: () => ({
    t: (key) => tMap[key] || key
  })
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    authMock.token = null;
    authMock.login.mockReset();
    authMock.register.mockReset();
    authMock.googleLogin.mockReset();
  });

  it("renders sign-in mode by default", () => {
    renderPage();
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("toggles to register mode", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "New here? Create account" }));

    expect(screen.getByPlaceholderText("Full name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });

  it("submits login form and calls login", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("Email"), "test@example.com");
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(authMock.login).toHaveBeenCalledWith("test@example.com", "secret");
    });
  });

  it("submits register form and calls register", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "New here? Create account" }));
    await user.type(screen.getByPlaceholderText("Full name"), "Jane Doe");
    await user.type(screen.getByPlaceholderText("Email"), "jane@example.com");
    await user.type(screen.getByPlaceholderText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(authMock.register).toHaveBeenCalledWith("Jane Doe", "jane@example.com", "secret");
    });
  });

  it("handles google login prompts", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    const modalHeading = screen.getByRole("heading", { name: "Sign in with Google" });
    const modal = modalHeading.closest(".modal-content");
    expect(modal).not.toBeNull();
    const modalQueries = within(modal);

    await user.type(modalQueries.getByPlaceholderText("Email"), "google@example.com");
    await user.type(modalQueries.getByPlaceholderText("Full Name"), "Google User");
    await user.click(modalQueries.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(authMock.googleLogin).toHaveBeenCalledWith("google@example.com", "Google User");
    });
  });
});

