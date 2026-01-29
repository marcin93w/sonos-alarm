export async function getAuthStatus() {
  const response = await fetch("/auth/status", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load auth status");
  }
  return response.json();
}

export async function getGroups() {
  const response = await fetch("/sonos/groups", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load groups");
  }
  return response.json();
}