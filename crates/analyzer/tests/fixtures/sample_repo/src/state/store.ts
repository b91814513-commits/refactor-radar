import { selectPrimaryUser } from "./selectors";

export function createStore(records: Array<{ id: string; email: string }>) {
  return {
    records,
    primary: selectPrimaryUser({ records, primary: null as string | null })
  };
}

