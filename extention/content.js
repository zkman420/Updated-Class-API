// Load the logs initially (you can modify this to load periodically)
async function fetchLogs() {
  try {
    const response = await fetch('http://localhost:3000/logs'); // Adjust the URL to your logs API endpoint
    const logs = await response.json();
    document.getElementById('log-output').innerHTML = logs.map(log => `<span>${log}</span>`).join('<br>');
  } catch (error) {
    document.getElementById('log-output').textContent = "Error fetching logs";
  }
}

fetchLogs();