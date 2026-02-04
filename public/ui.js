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

export function renderAlarms(alarms, configs, onConfigSave) {
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

      const label =
        alarm && (alarm.label || alarm.name || alarm.title)
          ? alarm.label || alarm.name || alarm.title
          : `Alarm ${alarm && alarm.alarmId ? alarm.alarmId : ""}`.trim();
      const time = formatTime(alarm && alarm.startTime);
      const enabled =
        alarm && typeof alarm.enabled === "boolean" ? alarm.enabled : null;
      const days = formatDays(alarm && alarm.recurrenceDays);
      const volume =
        alarm && Number.isFinite(alarm.volume) ? alarm.volume : null;
      const groupIds = (alarm && alarm.groupNames) || "";

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
      if (groupIds) metaParts.push(groupIds);
      if (metaParts.length) meta.textContent = metaParts.join(" | ");

      alarmItem.appendChild(header);
      if (meta.textContent) alarmItem.appendChild(meta);

      if (configs && onConfigSave && alarm.alarmId) {
        const cfg = configs[alarm.alarmId] || configs.defaults || {};
        alarmItem.appendChild(renderAlarmConfig(alarm.alarmId, cfg, onConfigSave));
      }

      list.appendChild(alarmItem);
    }
  }
  container.style.display = "block";
}

function renderAlarmConfig(alarmId, cfg, onConfigSave) {
  const div = document.createElement("div");
  div.className = "alarm-config";

  const save = () => {
    onConfigSave(alarmId, {
      rampEnabled: toggle.checked,
      maxVolume: parseInt(maxVol.value) || 15,
      rampDuration: parseInt(duration.value) || 60,
    });
  };

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "config-toggle";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = cfg.rampEnabled !== false;
  toggle.addEventListener("change", save);
  toggleLabel.appendChild(toggle);
  toggleLabel.append("Volume ramp");
  div.appendChild(toggleLabel);

  const maxVolField = document.createElement("label");
  maxVolField.className = "config-field";
  maxVolField.append("Max vol");
  const maxVol = document.createElement("input");
  maxVol.type = "number";
  maxVol.min = 1;
  maxVol.max = 100;
  maxVol.value = cfg.maxVolume ?? 15;
  maxVol.addEventListener("change", save);
  maxVolField.appendChild(maxVol);
  div.appendChild(maxVolField);

  const durationField = document.createElement("label");
  durationField.className = "config-field";
  durationField.append("Ramp min");
  const duration = document.createElement("input");
  duration.type = "number";
  duration.min = 1;
  duration.max = 180;
  duration.value = cfg.rampDuration ?? 60;
  duration.addEventListener("change", save);
  durationField.appendChild(duration);
  div.appendChild(durationField);

  return div;
}

export function hideAlarms() {
  const container = document.getElementById("alarms");
  if (container) container.style.display = "none";
}

export function setStatus(message) {
  const status = document.getElementById("status");
  if (status) status.textContent = message || "";
}
