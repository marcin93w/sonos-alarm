export function setConnectVisible(isVisible) {
  const button = document.getElementById("connect-button");
  if (!button) return;
  button.style.display = isVisible ? "inline-block" : "none";
}

export function renderGroups(groups) {
  const container = document.getElementById("groups");
  const list = document.getElementById("groups-list");
  if (!container || !list) return;
  list.innerHTML = "";
  if (!groups.length) {
    const item = document.createElement("li");
    item.textContent = "No groups found.";
    list.appendChild(item);
  } else {
    for (const group of groups) {
      const item = document.createElement("li");
      const title = document.createElement("div");
      title.className = "group-title";
      title.textContent = group.name || group.id || "Unnamed group";
      item.appendChild(title);

      const alarms = Array.isArray(group && group.alarms) ? group.alarms : [];
      const alarmList = document.createElement("ul");
      alarmList.className = "alarm-list";

      if (!alarms.length) {
        const alarmItem = document.createElement("li");
        alarmItem.className = "alarm-empty";
        alarmItem.textContent = "No alarms yet.";
        alarmList.appendChild(alarmItem);
      } else {
        for (const alarm of alarms) {
          const alarmItem = document.createElement("li");
          alarmItem.className = "alarm-item";

          if (typeof alarm === "string") {
            alarmItem.textContent = alarm;
            alarmList.appendChild(alarmItem);
            continue;
          }

          const label =
            alarm && (alarm.label || alarm.name || alarm.title)
              ? alarm.label || alarm.name || alarm.title
              : "Alarm";
          const time =
            alarm && (alarm.time || alarm.at || alarm.triggerTime)
              ? alarm.time || alarm.at || alarm.triggerTime
              : "";
          const enabled =
            alarm && typeof alarm.enabled === "boolean" ? alarm.enabled : null;
          const days = Array.isArray(alarm && alarm.days)
            ? alarm.days.join(", ")
            : alarm && typeof alarm.days === "string"
            ? alarm.days
            : "";
          const volume =
            alarm && Number.isFinite(alarm.volume) ? alarm.volume : null;

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
          if (metaParts.length) meta.textContent = metaParts.join(" | ");

          alarmItem.appendChild(header);
          if (meta.textContent) alarmItem.appendChild(meta);
          alarmList.appendChild(alarmItem);
        }
      }

      item.appendChild(alarmList);
      list.appendChild(item);
    }
  }
  container.style.display = "block";
}

export function hideGroups() {
  const container = document.getElementById("groups");
  if (container) container.style.display = "none";
}

export function setStatus(message) {
  const status = document.getElementById("status");
  if (status) status.textContent = message || "";
}