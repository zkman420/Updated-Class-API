document.addEventListener('DOMContentLoaded', function() {
  
    const serverStatusElem = document.getElementById('server-status');
    const logOutputElem = document.getElementById('log-output');
    const addUserButton = document.getElementById('add-user');
    const reloadCookiesButton = document.getElementById('reload-cookies');
    const usernameInput = document.getElementById('username');
    const fields = ['CFID', 'CFTOKEN'];
  
    const cookiePaths = [
      { name: 'CFID', path: 'https://tassweb.salc.qld.edu.au/' },
      { name: 'CFTOKEN', path: 'https://tassweb.salc.qld.edu.au/' }
    ];
  
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
  
    // Function to populate fields from cookies and save them to storage
    function populateFieldsFromCookies() {
      cookiePaths.forEach(cookie => {
        chrome.cookies.get({ url: cookie.path, name: cookie.name }, function(cookieData) {
          if (cookieData) {
            document.getElementById(cookie.name).value = cookieData.value;
            console.log(`Cookie found: ${cookie.name} = ${cookieData.value}`);
  
            // Save the cookie value to chrome.storage.local
            let storageObject = {};
            storageObject[cookie.name] = cookieData.value;
            chrome.storage.local.set(storageObject, function() {
              console.log(`Stored ${cookie.name} = ${cookieData.value}`);
            });
          } else {
            console.log(`Cookie not found: ${cookie.name}`);
          }
        });
      });
    }
  
// Function to load stored values from chrome.storage.local
function loadStoredValues() {
    chrome.storage.local.get(fields, function(result) {
      Object.keys(result).forEach(field => {
        document.getElementById(field).value = result[field];
        console.log(`Loaded ${field} from storage: ${result[field]}`);
      });
    });
  }
  
    // Function to add a new user
    addUserButton.addEventListener('click', async () => {
      const username = usernameInput.value.trim();
      if (username) {
        const CFID = document.getElementById('CFID').value.trim();
        const CFTOKEN = document.getElementById('CFTOKEN').value.trim();
        if (CFID && CFTOKEN) {
          try {
            const response = await fetch('http://localhost:3000/add-user', { // Adjust the URL to your add-user API endpoint
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ username, CFID, CFTOKEN })
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
  
    // Event listener for the reload cookies button
    reloadCookiesButton.addEventListener('click', populateFieldsFromCookies);
  
    // Initial calls
    fetchServerStatus();
    fetchLogs();
    loadStoredValues();  // Load stored values on initial load
    populateFieldsFromCookies();
    
    // Optionally refresh logs periodically
    setInterval(fetchLogs, 5000); // Fetch logs every 5 seconds
  });