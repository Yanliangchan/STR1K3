import { SetupChecklist } from "./setup-checklist";

/** Shown wherever a page needs an active batch and none is set. */
export function NoActiveBatch() {
  return <SetupChecklist />;
}
