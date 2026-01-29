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
      item.textContent = group.name || group.id || "Unnamed group";
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