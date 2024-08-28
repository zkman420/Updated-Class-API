document.addEventListener('DOMContentLoaded', function() {
    const serverStatusElem = document.getElementById('server-status');
    const logOutputElem = document.getElementById('log-output');
    const addUserButton = document.getElementById('add-user');
    const usernameInput = document.getElementById('username');
  
    // Function to fetch server status
    async function fetchServerStatus() {
      try {
        const response = await fetch('http://localhost:3000/'); // Adjust the URL to your API endpoint
        const data = await response.json();
        serverStatusElem.textContent = data.sqlServer === "Running" ? "Online" : "Offline";
      } catch (error) {
        serverStatusElem.textContent = "Error connecting to server";
      }
    }
  
    // Function to fetch live logs
    async function fetchLogs() {
      try {
        const response = await fetch('http://localhost:3000/logs'); // Adjust the URL to your logs API endpoint
        const logs = await response.json();
        logOutputElem.innerHTML = logs.map(log => `<span>${log}</span>`).join('<br>'); // Logs displayed with line breaks
      } catch (error) {
        logOutputElem.textContent = "Error fetching logs";
      }
    }
  
    // Function to add a new user
    addUserButton.addEventListener('click', async () => {
      const username = usernameInput.value.trim();
      if (username) {
        const CFID = document.getElementById('CFID').value.trim();
        const CFTOKEN = document.getElementById('CFTOKEN').value.trim();
        const SESSIONID = document.getElementById('SESSIONID').value.trim();
        const SESSIONTOKEN = document.getElementById('SESSIONTOKEN').value.trim();
        if (CFID && CFTOKEN && SESSIONID && SESSIONTOKEN) {
          try {
            const response = await fetch('http://localhost:3000/add-user', { // Adjust the URL to your add-user API endpoint
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ username, CFID, CFTOKEN, SESSIONID, SESSIONTOKEN })
            });
            if (response.ok) {
              alert('User added successfully');
              usernameInput.value = ''; // Clear the input
            } else {
              alert('Failed to add user');
            }
          } catch (error) {
            alert('Error connecting to server');
          }
        } else {
          alert('Please enter all cookie values');
        }
      } else {
        alert('Please enter a username');
      }
    });
  
    // Initial calls
    fetchServerStatus();
    fetchLogs();
    
    // Optionally refresh logs periodically
    setInterval(fetchLogs, 5000); // Fetch logs every 5 seconds
  });

  document.addEventListener('DOMContentLoaded', () => {
    // Listen for messages from the background script
    chrome.runtime.onMessage.addListener((message) => {
      if (message.cookieName && message.cookieValue) {
        // Auto-fill the cookie value into the corresponding input field
        const inputField = document.getElementById(message.cookieName);
        if (inputField) {
          inputField.value = message.cookieValue;
        }
      }
    });
  });