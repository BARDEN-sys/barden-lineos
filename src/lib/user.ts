import { DEMO_USER } from "./types";

// Name stamped on marks, daily rows, overrides and photos made on this phone.
// "demo-foreman" until someone signs in; then their display name.
let current = DEMO_USER;

export function currentUser(): string {
  return current;
}

export function setCurrentUser(name: string | null | undefined): void {
  current = name?.trim() || DEMO_USER;
}
