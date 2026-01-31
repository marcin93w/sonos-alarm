import { getAuthStatus, getAlarms } from "./api.js";
import {
  renderAlarms,
  hideAlarms,
  setConnectVisible,
  setStatus,
} from "./ui.js";

async function updateAuthStatus() {
  try {
    setStatus("Checking authentication...");
    const data = await getAuthStatus();
    if (data && data.authenticated) {
      setConnectVisible(false);
      const alarmsResponse = await getAlarms();
      const alarms = Array.isArray(alarmsResponse)
        ? alarmsResponse
        : Array.isArray(alarmsResponse && alarmsResponse.alarms)
        ? alarmsResponse.alarms
        : [];
      renderAlarms(alarms);
      setStatus("");
    } else {
      setConnectVisible(true);
      hideAlarms();
      setStatus("Not connected.");
    }
  } catch (err) {
    setConnectVisible(true);
    hideAlarms();
    setStatus("Unable to load status.");
  }
}

updateAuthStatus();
