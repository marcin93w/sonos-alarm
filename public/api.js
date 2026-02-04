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

export async function getAlarmConfig() {
  const response = await fetch("/alarm-config", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load alarm config");
  }
  return response.json();
}

export async function saveTimezone(timezone) {
  const response = await fetch("/timezone", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timezone }),
  });
  if (!response.ok) {
    throw new Error("Failed to save timezone");
  }
  return response.json();
}

export async function saveAlarmConfig(alarmId, config) {
  const response = await fetch("/alarm-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alarmId, ...config }),
  });
  if (!response.ok) {
    throw new Error("Failed to save alarm config");
  }
  return response.json();
}
