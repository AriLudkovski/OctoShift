require("dotenv").config();
const { createCanvas, loadImage } = require("canvas");
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
  authorize: async ({ teamId }) => {
    const token = getTokenForTeam(teamId);
    if (!token) throw new Error("No token found for team");
    return { botToken: token };
  },
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
            parseInt(payload.nowQueuing.match(/\d+$/)?.[0], 10) &&
          schedule[i].team == team
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
          if (!token || !channel) {
            console.warn(
              "Missing token or channel for team",
              getNameForTeam(team)
            );
          } else {
            console.log("attempted to send");
            await app.client.chat.postMessage({
              token,
              channel,
              text: message,
            });
            console.log(`sent to ${getNameForTeam(team)}`);
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
  await ack();

  const teamId = command.team_id;
  console.log(
    "recieved command: scout-assign: ",
    command.text,
    " from ",
    getDisplayName(command.user, teamId),
    "in",
    getNameForTeam(teamId)
  );
  const args = command.text.trim().split(/\s+/);
  if (args.length !== 3) {
    return respond("Usage: `/scout-assign 1-10 blue_1 @user`");
  }

  const [rangeStr, rawRole, mention] = args;
  const role = rawRole
    .toLowerCase()
    .replace("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  if (!allowedRoles.includes(rawRole.toLowerCase())) {
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
  let block = schedule.find(
    (b) => b.start === start && b.end === end && b.team == teamId
  );
  if (!block) {
    block = { start: start, end: end, assignments: {}, team: teamId };
    schedule.push(block);
  }

  block.assignments[role] = userId;
  saveSchedule(schedule);

  respond(
    `✅ Assigned <@${userId}> to *${role.toUpperCase()}* for matches ${start}-${end}`
  );
});
async function getDisplayName(userId, team) {
  if (!userId) return "none";
  try {
    const result = await app.client.users.info({
      user: userId,
      token: getTokenForTeam(team),
    });
    const name =
      result.user?.profile?.display_name || result.user?.real_name || "unknown";
    return name;
  } catch (e) {
    console.error(`Failed to fetch user ${userId}:`, e);
    return "unknown";
  }
}

async function generateScheduleImage(schedule, team) {
  const width = 1050;
  const height = 75 + 30 * schedule.length;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);

  // Text style
  ctx.fillStyle = "black";
  ctx.font = "20px DejaVu Sans Mono";

  // Header
  const header =
    "Block     Blue 1       Blue 2      Blue 3      Red 1       Red 2       Red 3";
  ctx.fillText(header, 10, 30);

  // Draw line below header
  ctx.beginPath();
  ctx.moveTo(10, 40);
  ctx.lineTo(width - 10, 40);
  ctx.stroke();

  // Draw schedule rows
  let y = 70;
  const len = 12;
  for (const block of schedule) {
    let row = `M ${block.start}-${block.end}`.padEnd(10, " ");
    const roles = ["Blue 1", "Blue 2", "Blue 3", "Red 1", "Red 2", "Red 3"];
    for (const role of roles) {
      const name = await getDisplayName(block.assignments[role], team);
      row +=
        name.length >= len
          ? name.slice(0, len - 2) + "… "
          : name.padEnd(len, " ");
    }
    ctx.fillText(row, 10, y);
    y += 30;
  }

  // Save to file or return buffer
  return canvas.toBuffer();
}

app.command("/print-schedule", async ({ command, ack, client }) => {
  await ack(); // Ack early to avoid timeout

  let team = command.team_id;
  console.log(
    "Recieved command: print schedule from ",
    getDisplayName(command.user_id),
    " in ",
    getNameForTeam(team)
  );
  const schedule = loadSchedule();

  var filteredSchedule = schedule.filter((element) => element.team == team);
  // Generate image buffer (could be from your generateScheduleImage function)
  const buffer = await generateScheduleImage(filteredSchedule, team);

  try {
    // Upload image file
    await client.filesUploadV2({
      channel_id: command.channel_id,
      initial_comment: "Here is the scouting schedule!",
      file: buffer,
      filename: "schedule.png",
    });
  } catch (error) {
    console.error("Failed to upload schedule image:", error);
  }
});

app.event("app_mention", async ({ event, client }) => {
  const token = getTokenForTeam(event.team);
  console.log(
    "Mentioned by ",
    getDisplayName(event.user, event.team),
    " in ",
    getNameForTeam(event.team)
  );
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
  console.log(command);
  console.log(
    "recieved: set-channel from",
    getDisplayName(command.user, command.team_id),
    " in ",
    getNameForTeam(command.team_id)
  );
  await ack();

  const teamId = command.team_id;
  const channelId = command.channel_id;
  const name = getNameForTeam(teamId);
  saveChannelForTeam(teamId, channelId);

  await respond({
    text: `✅ Default channel for ${
      name || "Missing name, please reinstall App!!!"
    } set to <#${channelId}>`,
    response_type: "ephemeral",
  });
});
// Start your app
(async () => {
  await app.start(3001);
  console.log("⚡️ Bolt app is running!");
})();
