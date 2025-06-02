// tokenStore.js

const fs = require("fs");
const path = require("path");

const storePath = path.join(__dirname, "/tokens.json");

// Load tokens from file (if it exists)
let tokenStore = {};
if (fs.existsSync(storePath)) {
  tokenStore = JSON.parse(fs.readFileSync(storePath, "utf-8"));
}

// Save the current token store to disk
function saveStore() {
  fs.writeFileSync(storePath, JSON.stringify(tokenStore, null, 2));
}

// Save token for a team ID
function saveTokenForTeam(teamId, token) {
  tokenStore[teamId].botToken = token;
  saveStore();
}

// Get token for a team ID
function getTokenForTeam(teamId) {
  return tokenStore[teamId].botToken;
}

function saveChannelForTeam(teamId, channelId) {
  if (!tokenStore[teamId]) tokenStore[teamId] = {};
  tokenStore[teamId].channelId = channelId;
  saveStore();
}

function getChannelForTeam(teamId) {
  return tokenStore[teamId]?.channelId || null;
}

function getAllTokens() {
  if (!fs.existsSync(tokenPath)) return {};
  return JSON.parse(fs.readFileSync(tokenPath, "utf8"));
}

module.exports = {
  saveTokenForTeam,
  getTokenForTeam,
  saveChannelForTeam,
  getChannelForTeam,
  getAllTokens,
};
