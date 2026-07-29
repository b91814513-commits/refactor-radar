import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import App from "./App";
import { ToastProvider } from "./components/common/Toast";
import { Dashboard } from "./pages/Dashboard";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";

function renderApp(route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider>
        <Routes>
          <Route element={<App />}>
            <Route index element={<Dashboard />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

test("renders topbar with brand name", () => {
  renderApp();
  expect(screen.getByText("Refactor Radar")).toBeInTheDocument();
});

test("renders dashboard page by default", () => {
  renderApp("/");
  // Dashboard content is present
  const buttons = screen.getAllByRole("button", { name: /analyze repo/i });
  expect(buttons.length).toBeGreaterThanOrEqual(1);
  const dashboardTexts = screen.getAllByText(/top refactor opportunities/i);
  expect(dashboardTexts.length).toBeGreaterThanOrEqual(1);
});

test("renders navigation links", () => {
  renderApp("/");
  const dashboardLinks = screen.getAllByRole("link", { name: /dashboard/i });
  expect(dashboardLinks.length).toBeGreaterThanOrEqual(1);
  const historyLinks = screen.getAllByRole("link", { name: /^history$/i });
  expect(historyLinks.length).toBeGreaterThanOrEqual(1);
  const settingsLinks = screen.getAllByRole("link", { name: /^settings$/i });
  expect(settingsLinks.length).toBeGreaterThanOrEqual(1);
});

test("renders history page", () => {
  renderApp("/history");
  const headings = screen.getAllByRole("heading", { name: /analysis history/i, level: 1 });
  expect(headings.length).toBeGreaterThanOrEqual(1);
});

test("renders settings page", () => {
  renderApp("/settings");
  const headings = screen.getAllByRole("heading", { name: /^settings$/i, level: 1 });
  expect(headings.length).toBeGreaterThanOrEqual(1);
  const descTexts = screen.getAllByText(/configure analysis thresholds/i);
  expect(descTexts.length).toBeGreaterThanOrEqual(1);
});
