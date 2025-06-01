require("dotenv").config();
const fs = require("fs");
const path = require("path");
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
  if (req.body.token == process.env.NEXUS_TOKEN) {
    res.status(200).send("OK");
    console.log("token confirmed");
    return;
  }
  let payload = req.body;
  let schedule = loadSchedule();
  let message = "";
  // Log or handle the webhook payload
  console.log("Webhook received: Now Queuing", payload.nowQueuing);
  if (payload.nowQueuing.match("Qualification")) {
    for (let i = 0; i < schedule.length; i++) {
      if (
        schedule[i].start ==
          parseInt(payload.nowQueuing.match(/\d+$/)?.[0], 10) &&
        !recentlyNotifiedMatches.has(i)
      ) {
        //prevent duplicates
        recentlyNotifiedMatches.add(i);
        setTimeout(() => {
          recentlyNotifiedMatches.delete(i);
        }, 30 * 1000);

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
        console.log(i);

        await app.client.chat.postMessage({
          token: process.env.SLACK_BOT_TOKEN,
          channel: "C08SLASV0NP",
          text: message,
        });
      }
    }
  }
  res.status(200).send("OK");
});
//make sure the data gets entered properly
const allowedRoles = ["red_1", "red_2", "red_3", "blue_1", "blue_2", "blue_3"];
app.command("/scout-assign", async ({ command, ack, respond }) => {
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

app.event("app_mention", async ({ event, say }) => {
  await say(`I am ready to print the current scouting schedule for an event!`);
});
// Start your app
(async () => {
  await app.start(3000);
  console.log("⚡️ Bolt app is running!");
})();
