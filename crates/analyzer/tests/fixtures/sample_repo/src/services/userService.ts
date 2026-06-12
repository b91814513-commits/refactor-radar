import { logInfo, logWarning } from "../core/logger";
import { sanitizeLabel } from "../utils/label";
import { sanitizeSegment } from "../utils/slug";
import { createStore } from "../state/store";
import { selectPrimaryUser } from "../state/selectors";

export type UserRecord = {
  id: string;
  email: string;
  address: string;
  city: string;
  country: string;
  displayName: string;
};

export function createUserRecord(input: UserRecord) {
  logInfo(`creating:${input.email}`);
  return {
    ...input,
    email: sanitizeLabel(input.email),
    address: sanitizeLabel(input.address),
    city: sanitizeSegment(input.city),
    country: sanitizeSegment(input.country)
  };
}

export function updateUserAddress(input: UserRecord) {
  logInfo(`update-address:${input.id}`);
  return {
    ...input,
    address: sanitizeLabel(input.address),
    city: sanitizeSegment(input.city),
    country: sanitizeSegment(input.country)
  };
}

export function updateUserDisplayName(input: UserRecord) {
  logInfo(`update-name:${input.id}`);
  return {
    ...input,
    displayName: sanitizeLabel(input.displayName)
  };
}

export function normalizeUsers(records: UserRecord[]) {
  logWarning(`normalizing:${records.length}`);
  return records.map(createUserRecord);
}

export function buildPrimaryUserStore(records: UserRecord[]) {
  const store = createStore(records);
  return selectPrimaryUser(store);
}

export function exportUserSnapshot(records: UserRecord[]) {
  return records.map((record) => `${record.id}:${record.email}`).join("\n");
}

export function importUserSnapshot(snapshot: string) {
  return snapshot
    .split("\n")
    .filter(Boolean)
    .map((row) => {
      const [id, email] = row.split(":");
      return {
        id,
        email,
        address: "",
        city: "",
        country: "",
        displayName: email
      };
    });
}

