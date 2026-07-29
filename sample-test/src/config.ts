import { clamp } from "./utils";

export const appConfig = {
  name: "sample-test",
  maxRetries: clamp(5, 1, 10),
  timeoutMs: 3000,
};

export function getTimeout(): number {
  return appConfig.timeoutMs;
}
