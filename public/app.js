import { getAuthStatus, getGroups } from "./api.js";
import {
  renderGroups,
  hideGroups,
  setConnectVisible,
  setStatus,
} from "./ui.js";

async function updateAuthStatus() {
  try {
    setStatus("Checking authentication...");
    const data = await getAuthStatus();
    if (data && data.authenticated) {
      setConnectVisible(false);
      const groupsResponse = await getGroups();
      const groups = Array.isArray(groupsResponse && groupsResponse.groups)
        ? groupsResponse.groups
        : [];
      renderGroups(groups);
      setStatus("");
    } else {
      setConnectVisible(true);
      hideGroups();
      setStatus("Not connected.");
    }
  } catch (err) {
    setConnectVisible(true);
    hideGroups();
    setStatus("Unable to load status.");
  }
}

updateAuthStatus();