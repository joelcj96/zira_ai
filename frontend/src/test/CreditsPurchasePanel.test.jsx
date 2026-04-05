import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreditsPurchasePanel from "../components/CreditsPurchasePanel.jsx";

const { state, apiMock } = vi.hoisted(() => ({
  state: { isPro: false, role: "admin" },
  apiMock: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

vi.mock("../api/client", () => ({ api: apiMock }));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ isPro: state.isPro, user: { role: state.role } })
}));

vi.mock("../context/I18nContext", () => ({
  useI18n: () => ({
    t: (key, params) => {
      if (key === "credits.purchaseSuccess") return `Purchased ${params?.count}`;
      if (key === "credits.purchaseFailed") return `Purchase failed ${params?.message || ""}`;
      return key;
    }
  })
}));

describe("CreditsPurchasePanel", () => {
  beforeEach(() => {
    state.isPro = false;
    state.role = "admin";
    apiMock.get.mockReset();
    apiMock.post.mockReset();

    apiMock.get.mockImplementation((url) => {
      if (url === "/credits/balance") {
        return Promise.resolve({
          data: { credits: 16, totalEarned: 16, totalSpent: 0, isUnlimited: false }
        });
      }
      if (url === "/credits/packages") {
        return Promise.resolve({
          data: {
            proposalCost: 1,
            applicationCost: 2,
            freeTierCredits: 16,
            packages: [
              { id: "10", credits: 10, price: 4.99, pricePerCredit: 0.499, popular: false, discount: 0 }
            ]
          }
        });
      }
      return Promise.resolve({ data: {} });
    });

    apiMock.post.mockResolvedValue({
      data: { credits: 26, totalEarned: 26, totalSpent: 0, isUnlimited: false }
    });
  });

  it("loads balance and packages", async () => {
    render(<CreditsPurchasePanel />);

    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith("/credits/balance");
      expect(apiMock.get).toHaveBeenCalledWith("/credits/packages");
    });

    expect(screen.getAllByText("16").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "credits.buyNow" })).toBeInTheDocument();
  });

  it("purchases credits when buy button is clicked", async () => {
    const user = userEvent.setup();
    render(<CreditsPurchasePanel />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "credits.buyNow" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "credits.buyNow" }));

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith("/credits/purchase", { package: "10" });
    });
  });

  it("shows unlimited mode for pro users", async () => {
    state.isPro = true;
    apiMock.get.mockImplementation((url) => {
      if (url === "/credits/balance") {
        return Promise.resolve({
          data: { credits: null, totalEarned: 0, totalSpent: 0, isUnlimited: true }
        });
      }
      if (url === "/credits/packages") {
        return Promise.resolve({
          data: {
            proposalCost: 1,
            applicationCost: 2,
            freeTierCredits: 16,
            packages: []
          }
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<CreditsPurchasePanel />);

    await waitFor(() => {
      const value = document.querySelector(".credit-value");
      expect(value?.textContent).toBe("∞");
    });
  });
});
