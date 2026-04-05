import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotificationBell from "../components/NotificationBell.jsx";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock("../api/client", () => ({ api: apiMock }));

vi.mock("../context/I18nContext", () => ({
  useI18n: () => ({
    t: (key, params) => {
      if (key === "notifications.newNotifications") return `New ${params?.count || 0}`;
      if (key === "notifications.title") return "Notifications";
      if (key === "notifications.markAllRead") return "Mark all as read";
      if (key === "notifications.noNotifications") return "No notifications";
      if (key === "notifications.noNotificationsSub") return "You are all caught up";
      if (key === "notifications.totalCount") return `Total ${params?.count || 0}`;
      if (key === "notifications.markAsRead") return "Mark as read";
      if (key === "notifications.markAsUnread") return "Mark as unread";
      if (key === "notifications.goToItem") return "Go to item";
      return key;
    }
  })
}));

describe("NotificationBell", () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.put.mockReset();
    apiMock.delete.mockReset();

    apiMock.get.mockImplementation((url) => {
      if (url === "/notifications") {
        return Promise.resolve({
          data: {
            unreadCount: 1,
            notifications: [
              {
                _id: "n1",
                title: "New match",
                message: "Role found",
                read: false,
                type: "job_match",
                color: "accent",
                icon: "briefcase",
                createdAt: new Date().toISOString()
              }
            ]
          }
        });
      }
      if (url === "/notifications/unread-count") {
        return Promise.resolve({ data: { unreadCount: 1 } });
      }
      return Promise.resolve({ data: {} });
    });

    apiMock.put.mockResolvedValue({ data: { success: true } });
    apiMock.delete.mockResolvedValue({ data: { success: true } });
  });

  it("loads notifications on mount and shows unread badge", async () => {
    render(<NotificationBell />);

    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith("/notifications");
    });

    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("expands dropdown on bell click", async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);

    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith("/notifications");
    });

    const bellButton = document.querySelector(".notification-bell");
    expect(bellButton).toBeTruthy();
    await user.click(bellButton);

    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(screen.getByText("New match")).toBeInTheDocument();
  });

  it("marks all as read", async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);

    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith("/notifications");
    });

    const bellButton = document.querySelector(".notification-bell");
    expect(bellButton).toBeTruthy();
    await user.click(bellButton);
    await user.click(screen.getByRole("button", { name: /mark all as read/i }));

    await waitFor(() => {
      expect(apiMock.put).toHaveBeenCalledWith("/notifications/mark-all/read");
    });
  });
});
