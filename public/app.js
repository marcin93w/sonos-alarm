import { getAuthStatus, getAlarms, getAlarmConfig, saveAlarmConfig, saveTimezone } from "./api.js";
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
      if (!data.isTimezoneConfigured) {
        await saveTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
      }
      const [alarmsResponse, configResponse] = await Promise.all([getAlarms(), getAlarmConfig()]);
      const alarms = Array.isArray(alarmsResponse)
        ? alarmsResponse
        : Array.isArray(alarmsResponse && alarmsResponse.alarms)
        ? alarmsResponse.alarms
        : [];
      const configs = { ...configResponse.configs, defaults: configResponse.defaults };
      renderAlarms(alarms, configs, (alarmId, config) => {
        saveAlarmConfig(alarmId, config);
      });
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
