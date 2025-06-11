require("dotenv").config();
const fs = require("fs");
const path = require("path");
const {
  getTokenForTeam,
  saveTokenForTeam,
  saveChannelForTeam,
  getChannelForTeam,
  saveNameForTeam,
  getNameForTeam,
  getAllTokens,
} = require("./tokenStore");
const schedulePath = path.join(__dirname, "schedule.json");
const { App, ExpressReceiver } = require("@slack/bolt");
const express = require("express");

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});
receiver.router.use(express.json());
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
});
//loading schedule
function loadSchedule() {
  //makes sure file exists
  if (!fs.existsSync(schedulePath)) {
    return [];
  }
  const data = fs.readFileSync(schedulePath, "utf-8");
  try {
    return JSON.parse(data);
  } catch (err) {
    console.error("Failed to parse schedule.json:", err);
    return [];
  }
}
//write to schedule
function saveSchedule(schedule) {
  fs.writeFileSync(schedulePath, JSON.stringify(schedule, null, 2));
}
const teams = ["Blue 1", "Blue 2", "Blue 3", "Red 1", "Red 2", "Red 3"];
const recentlyNotifiedMatches = new Set();

//recieving match data
receiver.router.post("/webhook", async (req, res) => {
  try {
    if (req.body.token == process.env.NEXUS_TOKEN) {
      res.status(200).send("OK");
      console.log("token confirmed");
      return;
    }
  } catch (e) {
    console.log("yipee");
  }

  let payload = req.body;
  let schedule = loadSchedule();
  let message = "";
  // Log or handle the webhook payload
  console.log("Webhook received: Now Queuing", payload.nowQueuing);

  if (
    payload.nowQueuing.match("Qualification") &&
    !recentlyNotifiedMatches.has(payload.nowQueuing)
  ) {
    //prevent duplicates
    recentlyNotifiedMatches.add(payload.nowQueuing);
    setTimeout(() => {
      recentlyNotifiedMatches.delete(payload.nowQueuing);
    }, 30 * 1000);
    const tokenStore = getAllTokens();
    for (const team in tokenStore) {
      for (let i = 0; i < schedule.length; i++) {
        if (
          schedule[i].start ==
          parseInt(payload.nowQueuing.match(/\d+$/)?.[0], 10)
        ) {
          //ping starting people
          assignments = schedule[i].assignments;
          message += `Prepare to scout starting with match ${schedule[i].start} until match ${schedule[i].end} \n`;
          for (let j = 0; j < teams.length; j++) {
            if (j == 3) {
              message += `\n`;
            }
            if (j < 3) {
              message += `🟦`;
            } else {
              message += `🟥`;
            }
            message += `${teams[j]}: `;
            if (assignments[teams[j]]) {
              message += `<@${assignments[teams[j]]}>\t`;
            } else {
              message += `none\t`;
            }
          }
          const token = tokenStore[team].botToken;
          const channel = tokenStore[team].channelId;
          console.log(token);
          console.log(channel);
          if (!token || !channel) {
            console.warn("Missing token or channel for team", team);
          } else {
            console.log("attempted to send");
            await app.client.chat.postMessage({
              token,
              channel,
              text: message,
            });
            console.log(`sent to ${team}`);
          }
        }
      }
    }
  }
  res.status(200).send("OK");
});
//make sure the data gets entered properly
const allowedRoles = ["red_1", "red_2", "red_3", "blue_1", "blue_2", "blue_3"];
app.command("/scout-assign", async ({ command, ack, respond }) => {
  console.log("recieved command: scout-assign: ", command.text);
  await ack();
  const args = command.text.trim().split(/\s+/);
  if (args.length !== 3) {
    return respond("Usage: `/scout-assign 1-10 blue_1 @user`");
  }

  const [rangeStr, role, mention] = args;

  if (!allowedRoles.includes(role.toLowerCase())) {
    return respond(
      `❌ Invalid role "${rawRole}". Please use one of: ${allowedRoles.join(
        ", "
      )}`
    );
  }
  const rangeMatch = rangeStr.match(/^(\d+)-(\d+)$/);
  const userMatch = mention.match(/^<@([UW][A-Z0-9]+)(\|[^>]+)?>$/);
  if (!rangeMatch || !userMatch) {
    return respond("❌ Invalid format. Use: `/scout-assign 1-10 blue_1 @user`");
  }

  const start = parseInt(rangeMatch[1], 10);
  const end = parseInt(rangeMatch[2], 10);
  const userId = userMatch[1];

  // Load and update schedule
  const schedule = loadSchedule();
  let block = schedule.find((b) => b.start === start && b.end === end);
  if (!block) {
    block = { start: start, end: end, assignments: {} };
    schedule.push(block);
  }

  block.assignments[
    role
      .toLowerCase()
      .replace("_", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  ] = userId;
  saveSchedule(schedule);

  respond(
    `✅ Assigned <@${userId}> to *${role.toUpperCase()}* for matches ${start}-${end}`
  );
});

app.event("app_mention", async ({ event, client }) => {
  const token = getTokenForTeam(event.team);
  console.log("Team: ", event.team);
  console.log("Token: ", token);
  const result = await client.chat.postMessage({
    token,
    channel: event.channel,
    text: `👋 Hello, <@${event.user}>!`,
  });
  if (!result.ok) {
    console.err("slack api error: ", result.error);
  }
});
//redirect url
app.receiver.router.get("/slack/oauth_redirect", async (req, res) => {
  const code = req.query.code;

  try {
    const result = await app.client.oauth.v2.access({
      client_id: process.env.SLACK_CLIENT_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET,
      code, //,
      //redirect_uri: process.env.SLACK_REDIRECT_URI, // Same as configured below
    });

    const botToken = result.access_token;
    const teamId = result.team.id;
    const teamName = result.team.name;

    saveTokenForTeam(teamId, botToken);
    saveNameForTeam(teamId, teamName);
    console.log("OAuth success:", result);
    res.send("✅ Slack app installed successfully!");
  } catch (error) {
    console.error("OAuth error:", error);
    res.status(500).send("⚠️ OAuth failed.");
  }
});

app.command("/set-channel", async ({ command, ack, respond }) => {
  console.log("recieved: set-channel");
  await ack();

  const teamId = command.team_id;
  const channelId = command.channel_id;
  const name = getNameForTeam(teamId);
  saveChannelForTeam(teamId, channelId);

  await respond({
    text: `✅ Default channel for team ${name} set to <#${channelId}>`,
    response_type: "ephemeral",
  });
});
// Start your app
(async () => {
  await app.start(3001);
  console.log("⚡️ Bolt app is running!");
})();
