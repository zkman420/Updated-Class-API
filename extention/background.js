chrome.alarms.create('checkServerStatus', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkServerStatus') {
    // Logic to check server status or perform other tasks periodically
    chrome.action.setBadgeText({ text: '!' }); // Set a badge if there’s something to notify the user
  }
});
