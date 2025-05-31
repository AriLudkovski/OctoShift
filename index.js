require("dotenv").config();
const { App } = require("@slack/bolt");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});
app.event("app_mention", async ({ event, say }) => {
  var message = event.text;
  // Look up the user from DB
  if (message.toLowerCase().search("register") != -1) {
  }
  await say(`Hello world, and welcome <@${event.user}>!`);
  await say({
    text: "apples",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "This is a section block with a button.",
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Click Me",
          },
          value: "click_me_123",
          action_id: "button",
        },
      },
      {
        type: "actions",
        block_id: "actionblock789",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Primary Button",
            },
            style: "primary",
            value: "click_me_456",
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Link Button",
            },
            url: "https://api.slack.com/block-kit",
          },
        ],
      },
    ],
  });

  console.log(event.user);
});
// Start your app
(async () => {
  await app.start(3000);
  console.log("⚡️ Bolt app is running!");
})();
