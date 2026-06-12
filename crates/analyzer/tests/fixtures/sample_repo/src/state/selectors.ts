import { logInfo } from "../core/logger";
import { createStore } from "./store";

export function selectPrimaryUser(store: {
  records: Array<{ id: string; email: string }>;
  primary: string | null;
}) {
  if (store.primary) {
    return store.primary;
  }

  const fallback = store.records[0]?.id ?? null;
  logInfo(`primary:${fallback ?? "none"}`);
  return fallback;
}

export function rebuildPrimaryStore(records: Array<{ id: string; email: string }>) {
  return createStore(records);
}

