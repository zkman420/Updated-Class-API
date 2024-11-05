const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const cron = require("node-cron");
const nodemailer = require("nodemailer");
const mysql = require("mysql2");
const fs = require('fs');
const winston = require("winston");
const app = express();
const io = require('@pm2/io')

const currentReqs = io.counter({
  name: 'Realtime request count',
  id: 'app/realtime/requests'
});

// Initialize Winston Logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "server.log" }),
  ],
});

const Classes = [];

const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  port: "3308",
  password: "",
  database: "Class-Notifier",
  connectionLimit: 10,
});

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "OPTIONS, GET, POST, PUT, PATCH, DELETE"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  currentReqs.inc();
  next();
  logger.info(`${req.method} ${req.url}`);
});

app.get("/", async (req, res) => {
  const sql = "SELECT 1+1 AS result";
  pool.query(sql, (err, result) => {
    if (err) {
      logger.error("SQL Error: " + err.message);
      return res.status(500).json({ message: "Alive and well", sqlServer: "Down" });
    } else {
      logger.info("SQL check successful.");
      return res.status(200).json({ message: "Alive and well", sqlServer: "Running" });
    }
  });
});

// Get Class Info
async function fetchClassInfo(cookies) {
  logger.info("Fetching class info...");

  if (!cookies || Object.keys(cookies).length === 0) {
    logger.warn("No cookies provided.");
    throw new Error("Cookies required.");
  }

  const cookieString = Object.keys(cookies).map((key) => `${key}=${cookies[key]}`).join("; ");

  try {
    const response = await axios.get(
      "https://tassweb.salc.qld.edu.au/studentcafe/index.cfm?do=studentportal.home#timetable",
      { headers: { Cookie: cookieString } }
    );

    const $ = cheerio.load(response.data);
    logger.debug("HTML received.");
    

    const classes = [];

    $("tr").each((index, element) => {
      const period = $(element).find("td").eq(0).text().trim().replace(/[\n\t]/g, "").replace(/\s*\[.*?\]/g, "");
      const classInfo = $(element).find("td").eq(1).text().trim().replace(/[\n\t]/g, "").replace(/\s*\[.*?\]\s*\d+\s*[A-Z]*$/, "");
      const location = $(element).find("td").eq(2).text().trim().replace(/[\n\t]/g, "");
      const teacher = $(element).find("td").eq(3).text().trim().replace(/[\n\t]/g, "");

      if (period && classInfo && location && teacher) {
        const classData = { period, class: classInfo, location, teacher };
        logger.debug(`Parsed: ${JSON.stringify(classData)}`);
        classes.push(classData);
      }
    });

    logger.info(`Found ${classes.length} classes.`);
    return classes;
  } catch (error) {
    logger.error("Fetch error: " + error.message);
    throw error;
  }
}

async function fetchClass(period, userID) {
  logger.info(`Fetching class for period: ${period}, userID: ${userID}`);
  try {
    const cookies = await getCookiesForUser(userID);
    if (!cookies) {
      logger.error("No cookies for userID: " + userID);
      throw new Error("Cookies retrieval failed");
    }

    const classes = await fetchClassInfo(cookies);
    const classInfo = classes.find((c) => {
      const periodNumber = c.period.match(/\d+/);
      return periodNumber && periodNumber[0] === String(period);
    });

    classInfo ? logger.info(`Class found: ${JSON.stringify(classInfo)}`) : logger.warn(`No class for period ${period}`);

    return classInfo;
  } catch (error) {
    logger.error("Class fetch error: " + error.message);
    throw error;
  }
}

async function fetchUniform(userID) {
  logger.info(`Fetching uniform for userID: ${userID}`);
  try {
    const cookies = await getCookiesForUser(userID);
    if (!cookies) {
      logger.error("No cookies for userID: " + userID);
      throw new Error("Cookies retrieval failed");
    }

    const classInfo = await fetchClassInfo(cookies);
    const sportClass = classInfo.find((info) => info.class.includes("Sport"));

    if (sportClass) {
      logger.info(`Sport class period: ${sportClass.period}`);
    } else if (new Date().getDay() === 4) {
      logger.info("It's Thursday, assuming sport uniform");
      return "Thursday Sport";
    } else {
      logger.warn(`No sport class for userID: ${userID}`);
    }

    return sportClass ? sportClass.period : "";
  } catch (error) {
    logger.error("Uniform fetch error: " + error.message);
    throw error;
  }
}

// Endpoints
app.post("/send-notification/:topic/:message", async (req, res) => {
  const { message, topic } = req.params;
  try {
    await sendNotification(message, topic);
    logger.info(`Notification sent to: ${topic}`);
    res.status(200).json({ message: "Notification sent successfully" });
  } catch (error) {
    logger.error("Notification error: " + error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/fetch-classes-info", async (req, res) => {
  try {
    const cookies = await getCookiesForUser(1);
    if (!cookies) {
      logger.error("Failed to retrieve cookies.");
      return res.status(500).json({ error: "Failed to retrieve cookies" });
    }
    logger.debug("Cookies fetched.");

    const classes = await fetchClassInfo(cookies);
    res.status(200).json({ classes });
  } catch (error) {
    logger.error("Classes fetch error: " + error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/fetch-class-info/:period/:userID", async (req, res) => {
  const { period, userID } = req.params;
  if (!period || !userID) {
    logger.warn("Missing parameters.");
    return res.status(400).json({ error: "Missing required parameters" });
  }
  try {
    const classInfo = await fetchClass(period, userID);
    if (!classInfo) {
      return res.status(404).json({ error: "Class not found" });
    }
    const username = await getUsername(userID);
    const topic = "class_notifier_" + username;
    const message = `Next class: Period ${period}, ${classInfo.class}, ${classInfo.teacher} at ${classInfo.location}`;
    await sendNotification(message, topic);
    res.status(200).json({ message: "Notification sent" });
  } catch (error) {
    logger.error("Class fetch error: " + error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/fetch-uniform/:userID", async (req, res) => {
  const { userID } = req.params;
  if (!userID) {
    logger.warn("Missing userID.");
    return res.status(400).json({ error: "Missing required parameters" });
  }
  try {
    const uniform = await fetchUniform(userID);
    if (uniform) {
      logger.info(`Uniform period: ${uniform}`);
      res.status(200).json({ uniform: "True", period: uniform });
    } else {
      logger.warn(`No uniform for userID: ${userID}`);
      res.status(404).json({ error: "No Sport uniform found" });
    }
  } catch (error) {
    logger.error("Uniform fetch error: " + error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Functionality extension

app.post('/add-user', async (req, res) => {
  const { username } = req.body;
  if (!username) {
    logger.warn("Missing username");
    logger.debug(`Request body: ${JSON.stringify(req.body)}`);
    return res.status(400).json({ error: "Missing required parameters" });
  }
  try {
    const CFID = req.body.CFID;
    const CFTOKEN = req.body.CFTOKEN;
    const SESSIONID = req.body.SESSIONID;
    const SESSIONTOKEN = req.body.SESSIONTOKEN;
    if (!CFID || !CFTOKEN || !SESSIONID || !SESSIONTOKEN) {
      logger.warn("Missing cookie values");
      logger.debug(`Request body: ${JSON.stringify(req.body)}`);
      return res.status(400).json({ error: "Missing required parameters" });
    }
    logger.info(`Adding user: ${username} with cookies: ${JSON.stringify({ CFID, CFTOKEN, SESSIONID, SESSIONTOKEN })}`);
    await addUser(username, CFID, CFTOKEN, SESSIONID, SESSIONTOKEN);
    logger.info(`User ${username} added successfully with cookies: ${JSON.stringify({ CFID, CFTOKEN, SESSIONID, SESSIONTOKEN })}`);
    res.status(201).json({ message: 'User added' });
  } catch (error) {
    logger.error("User add error: " + error.message);
    logger.debug(`Request body: ${JSON.stringify(req.body)}`);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get('/logs', (req, res) => {
    fs.readFile('server.log', 'utf8', (err, data) => {
      if (err) {
        logger.error('Log read error: ' + err.message);
        return res.status(500).json({ error: "Error fetching logs" });
      }
  
      // Split logs into an array and filter out empty lines
      const logs = data.trim() ? data.split('\n') : [];
  
      // Process logs to remove date and format time, handle invalid timestamps
      const formattedLogs = logs.slice(-30).map(log => {
        const [timestamp, ...rest] = log.split(' ');
  
        // Ensure the timestamp is valid
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) {
          // If timestamp is invalid, just return the original log entry without modification
          return `Invalid timestamp: ${log}`;
        }
  
        const time = date.toLocaleTimeString('en-US', { hour12: false });
        return `${time} ${rest.join(' ')}`;
      });
  
      res.status(200).json(formattedLogs);
    });
  });
  

// Send notification functions
async function sendNotification(message, topic) {
  try {
    const response = await axios.post(`https://ntfy.sh/${topic}`, message, {
      headers: { "Content-Type": "text/plain"
      },
    });

    response.status === 200
      ? logger.info(`Notification sent to ${topic}`)
      : logger.warn(`Notification failed with status: ${response.status}`);
  } catch (error) {
    logger.error("Notification send error: " + error.message);
  }
}

async function sendClassNotification(period, userID) {
  try {
    const classInfo = await fetchClass(period, userID);
    if (!classInfo) {
      logger.warn(`No class for userID: ${userID}, period: ${period}`);
      return;
    }

    const username = await getUsername(userID);
    if (!username) {
      logger.warn(`No username for userID: ${userID}`);
      return;
    }

    const topic = `class_notifier_${username}`;
    const message = `Next class: Period ${period}, ${classInfo.class}, ${classInfo.teacher} at ${classInfo.location}`;
    logger.info(`Sending notification: ${message}`);
    await sendNotification(message, topic);
  } catch (error) {
    logger.error("Class notification error: " + error.message);
  }
}

async function sendClassNotificationAll(period) {
  logger.info(`Notifying all users for period: ${period}`);
  const sql = "SELECT UserID FROM Users";
  pool.query(sql, (err, result) => {
    if (err) {
      logger.error("User fetch error: " + err.message);
      return;
    }

    result.forEach((row) => {
      const userID = row.UserID;
      sendClassNotification(period, userID).catch((error) => {
        logger.error(`Notification error for userID: ${userID}, period: ${period} - ${error.message}`);
      });
    });
  });
}

async function sendUniformNotification(userID) {
  const uniform = await fetchUniform(userID);
  console.log(uniform)
  if (uniform && uniform.includes("Period")) {
    try {
      const username = await getUsername(userID);
      if (!username) {
        logger.warn(`No username for userID: ${userID}`);
        return;
      }
      const topic = `class_notifier_${username}`;
      const message = `Good Morning ${username}, remember to wear your sport uniform!`;
      logger.info(`Sending notification: ${message}`);
      await sendNotification(message, topic);
    } catch (error) {
      logger.error("Uniform notification error: " + error.message);
    }
  } else if (uniform === "Thursday Sport") {
    try {
      const username = await getUsername(userID);
      const topic = `class_notifier_${username}`;
      const message = `Good Morning ${username}, remember to wear your sport uniform!`;
      logger.info(`Sending notification: ${message}`);
      await sendNotification(message, topic);
    } catch (error) {
      logger.error("Uniform notification error: " + error.message);
    }
  }
}
// Helper functions

async function addUser(username, CFID, CFTOKEN, SESSIONID, SESSIONTOKEN) {
  const sql = "INSERT INTO Users (username) VALUES (?)";
  const values = [username];
  try {
    await new Promise((resolve, reject) => {
      pool.query(sql, values, (err, result) => {
        if (err) {
          logger.error("User add error: " + err.message);
          reject(err);
        } else {
          logger.info(`User ${username} added successfully`);
          const userID = result.insertId;
          const cookieSql = "INSERT INTO Cookies (UserID, CFID, CFTOKEN, SESSIONID, SESSIONTOKEN) VALUES (?, ?, ?, ?, ?)";
          const cookieValues = [userID, CFID, CFTOKEN, SESSIONID, SESSIONTOKEN];
          pool.query(cookieSql, cookieValues, (err, result) => {
            if (err) {
              logger.error("Cookie add error: " + err.message);
              reject(err);
            } else {
              logger.info(`Cookies added for user ${username}`);
              resolve();
            }
          });
        }
      });
    });
  } catch (error) {
    logger.error("User add error: " + error.message);
    throw error;
  }
}
async function getCookiesForUser(userID) {
  logger.debug(`Fetching cookies for userID: ${userID}`);
  return new Promise((resolve, reject) => {
    const sql = "SELECT CFID, CFTOKEN, SESSIONID, SESSIONTOKEN FROM Cookies WHERE UserID = ?";
    pool.query(sql, [userID], (err, result) => {
      if (err) {
        logger.error("Cookie fetch error: " + err.message);
        reject(err);
      } else if (result.length > 0) {
        logger.debug("Cookies fetched.");
        const cookies = {
          CFID: result[0].CFID,
          CFTOKEN: result[0].CFTOKEN,
          SESSIONID: result[0].SESSIONID,
          SESSIONTOKEN: result[0].SESSIONTOKEN,
        };
        resolve(cookies);
      } else {
        logger.warn("No cookies found.");
        resolve({});
      }
    });
  });
}

async function getUsername(userID) {
  logger.debug(`Fetching username for userID: ${userID}`);
  return new Promise((resolve, reject) => {
    const sql = "SELECT username FROM Users WHERE UserID = ?";
    pool.query(sql, [userID], (err, result) => {
      if (err) {
        logger.error("Username fetch error: " + err.message);
        reject(err);
      } else if (result.length > 0) {
        const username = result[0].username;
        logger.debug(`Username: ${username}`);
        resolve(username);
      } else {
        logger.warn(`No username for userID: ${userID}`);
        resolve(null);
      }
    });
  });
}
sendUniformNotification(1)
// Scheduled tasks
cron.schedule("00 7 * * 1-5", () => sendUniformNotification(1)); //uniform usr id 1
cron.schedule("55 8 * * 1-3,5", () => sendClassNotificationAll(1));
cron.schedule("10 9 * * 4", () => sendClassNotificationAll(1));
cron.schedule("45 9 * * 1-3,5", () => sendClassNotificationAll(2));
cron.schedule("55 9 * * 4", () => sendClassNotificationAll(2));
cron.schedule("00 11 * * 1-3,5", () => sendClassNotificationAll(3));
cron.schedule("50 11 * * 1-3,5", () => sendClassNotificationAll(4));
cron.schedule("45 11 * * 4", () => sendClassNotificationAll(4));
cron.schedule("30 13 * * 1-3,5", () => sendClassNotificationAll(5));
cron.schedule("00 13 * * 4", () => sendClassNotificationAll(5));
cron.schedule("20 14 * * 1-3,5", () => sendClassNotificationAll(6));








// work 


// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});