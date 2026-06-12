import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";

import App from "./App";

test("renders analyzer and results sections", () => {
  render(<App />);

  expect(screen.getByRole("heading", { name: /refactor radar/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /analyze repo/i })).toBeInTheDocument();
  expect(screen.getByText(/top refactor opportunities/i)).toBeInTheDocument();
});
