export async function getAuthStatus() {
  const response = await fetch("/auth/status", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load auth status");
  }
  return response.json();
}

export async function getAlarms() {
  const response = await fetch("/alarms", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load alarms");
  }
  return response.json();
}
