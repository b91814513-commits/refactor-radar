import { logInfo } from "../core/logger";
import { createUserRecord } from "../services/userService";

export function buildDashboardSummary(email: string) {
  logInfo("build-dashboard");
  return createUserRecord({
    id: "1",
    email,
    address: "Example Street",
    city: "Shanghai",
    country: "China",
    displayName: email
  });
}

