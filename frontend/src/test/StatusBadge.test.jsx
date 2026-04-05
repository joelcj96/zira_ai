import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusBadge from "../components/StatusBadge";

// Provide a minimal t() that resolves from a lookup map, with raw-value fallback
vi.mock("../context/I18nContext.jsx", () => ({
  useI18n: () => ({
    t: (key, _params, fallback) => {
      const map = {
        "status.active": "Active",
        "status.banned": "Banned",
        "status.pending": "Pending",
        "status.accepted": "Accepted",
        "status.rejected": "Rejected"
      };
      return map[key] ?? fallback ?? key;
    }
  })
}));

describe("StatusBadge", () => {
  it("renders the translated label for a known status", () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders the translated label for 'banned'", () => {
    render(<StatusBadge status="banned" />);
    expect(screen.getByText("Banned")).toBeInTheDocument();
  });

  it("renders the translated label for 'pending'", () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("falls back to the raw status value for unknown statuses", () => {
    render(<StatusBadge status="interview" />);
    expect(screen.getByText("interview")).toBeInTheDocument();
  });

  it("applies a CSS class matching the status prop", () => {
    const { container } = render(<StatusBadge status="active" />);
    expect(container.firstChild).toHaveClass("active");
    expect(container.firstChild).toHaveClass("status-badge");
  });
});
