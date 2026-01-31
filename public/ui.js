export function setConnectVisible(isVisible) {
  const button = document.getElementById("connect-button");
  if (!button) return;
  button.style.display = isVisible ? "inline-block" : "none";
}

function formatTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDays(days) {
  if (!days) return "";
  if (Array.isArray(days)) return days.join(", ");
  if (typeof days === "string") return days;
  return "";
}

export function renderAlarms(alarms) {
  const container = document.getElementById("alarms");
  const list = document.getElementById("alarms-list");
  if (!container || !list) return;
  list.innerHTML = "";
  if (!alarms.length) {
    const item = document.createElement("li");
    item.textContent = "No alarms found.";
    list.appendChild(item);
  } else {
    for (const alarm of alarms) {
      const alarmItem = document.createElement("li");
      alarmItem.className = "alarm-item";

      if (typeof alarm === "string") {
        alarmItem.textContent = alarm;
        list.appendChild(alarmItem);
        continue;
      }

      const description = alarm && alarm.description ? alarm.description : {};
      const recurrence = description && description.recurrence ? description.recurrence : {};
      const actuator = description && description.actuator ? description.actuator : {};

      const label =
        alarm && (alarm.label || alarm.name || alarm.title)
          ? alarm.label || alarm.name || alarm.title
          : `Alarm ${alarm && alarm.alarmId ? alarm.alarmId : ""}`.trim();
      const time = formatTime(description.startTime);
      const enabled =
        alarm && typeof alarm.enabled === "boolean" ? alarm.enabled : null;
      const days = formatDays(recurrence.days);
      const volume = Number.isFinite(actuator.volume) ? actuator.volume : null;
      const state = alarm && alarm.state ? alarm.state : "";

      const header = document.createElement("div");
      header.className = "alarm-header";

      const alarmTitle = document.createElement("div");
      alarmTitle.className = "alarm-title";
      alarmTitle.textContent = time ? `${label} - ${time}` : label;
      header.appendChild(alarmTitle);

      if (enabled !== null) {
        const badge = document.createElement("span");
        badge.className = enabled ? "alarm-badge on" : "alarm-badge off";
        badge.textContent = enabled ? "Enabled" : "Paused";
        header.appendChild(badge);
      }

      const meta = document.createElement("div");
      meta.className = "alarm-meta";
      const metaParts = [];
      if (days) metaParts.push(days);
      if (volume !== null) metaParts.push(`Volume ${volume}`);
      if (state) metaParts.push(state);
      if (metaParts.length) meta.textContent = metaParts.join(" | ");

      alarmItem.appendChild(header);
      if (meta.textContent) alarmItem.appendChild(meta);
      list.appendChild(alarmItem);
    }
  }
  container.style.display = "block";
}

export function hideAlarms() {
  const container = document.getElementById("alarms");
  if (container) container.style.display = "none";
}

export function setStatus(message) {
  const status = document.getElementById("status");
  if (status) status.textContent = message || "";
}
