import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";

import App from "./App";

test("renders analyzer and results sections", () => {
  render(<App />);

  expect(screen.getByText("Refactor Radar")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /analyze a repository/i, level: 1 })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /analyze repo/i })).toBeInTheDocument();
  expect(screen.getByText(/top refactor opportunities/i)).toBeInTheDocument();
});
