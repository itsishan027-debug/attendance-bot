const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  SlashCommandBuilder, 
  REST, 
  Routes 
} = require("discord.js");
const express = require("express");
const fs = require("fs");

// ================== EXPRESS ==================
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("Bot is running 24/7"));
app.listen(PORT, () => console.log("Web server started"));

// ================== CONFIG ==================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const TARGET_SERVER_ID = "1434084048719843420";
const TARGET_CHANNEL_ID = "1471509183215173664";

// ================== CLIENT ==================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ================== DATA ==================
let data = {};
const FILE = "./attendance.json";

function loadData() {
  if (fs.existsSync(FILE)) {
    data = JSON.parse(fs.readFileSync(FILE));
  }
}
function saveData() {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}
loadData();

// ================== HELPERS ==================
function format(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function time(ts) {
  return `<t:${Math.floor(ts / 1000)}:t>`;
}

// ================== SLASH COMMANDS ==================
const commands = [
  new SlashCommandBuilder().setName("online").setDescription("Start your attendance"),
  new SlashCommandBuilder().setName("offline").setDescription("Stop your attendance"),
  new SlashCommandBuilder().setName("status").setDescription("Check your attendance"),
  new SlashCommandBuilder().setName("history").setDescription("View your recent sessions"),
  new SlashCommandBuilder().setName("help").setDescription("How to use the attendance bot")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  );
  console.log("Slash commands registered");
})();

// ================== CORE FUNCTIONS ==================
function ensureUser(id) {
  if (!data[id]) {
    data[id] = { total: 0, start: null, sessions: [] };
  }
}

// ================== TEXT COMMANDS ==================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild || message.guild.id !== TARGET_SERVER_ID) return;
  if (message.channel.id !== TARGET_CHANNEL_ID) return;

  const content = message.content.toLowerCase();
  const userId = message.author.id;
  ensureUser(userId);

  // ONLINE
  if (content === "online") {
    await message.delete().catch(() => {});
    if (data[userId].start) return;

    data[userId].start = Date.now();
    saveData();

    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor("Green")
          .setDescription(`🟢 <@${userId}> is now **ONLINE**`)
          .setTimestamp()
      ]
    });
  }

  // OFFLINE
  if (content === "offline") {
    await message.delete().catch(() => {});
    if (!data[userId].start) return;

    const end = Date.now();
    const duration = end - data[userId].start;

    data[userId].total += duration;
    data[userId].sessions.push({
      start: data[userId].start,
      end,
      duration
    });

    data[userId].start = null;
    saveData();

    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            `🔴 <@${userId}> is now **OFFLINE**\n\n` +
            `🟢 Online: ${time(data[userId].sessions.at(-1).start)}\n` +
            `🔴 Offline: ${time(end)}\n` +
            `⏱ Duration: ${format(duration)}`
          )
          .setTimestamp()
      ]
    });
  }
});

// ================== SLASH COMMAND HANDLER ==================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.guildId !== TARGET_SERVER_ID) return;
  if (interaction.channelId !== TARGET_CHANNEL_ID) {
    return interaction.reply({ content: "Wrong channel", ephemeral: true });
  }

  const userId = interaction.user.id;
  ensureUser(userId);

  // /online
  if (interaction.commandName === "online") {
    if (data[userId].start)
      return interaction.reply({ content: "You are already online.", ephemeral: true });

    data[userId].start = Date.now();
    saveData();

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Green")
          .setDescription(`🟢 <@${userId}> is now **ONLINE**`)
          .setTimestamp()
      ]
    });
  }

  // /offline
  if (interaction.commandName === "offline") {
    if (!data[userId].start)
      return interaction.reply({ content: "You are not online.", ephemeral: true });

    const end = Date.now();
    const duration = end - data[userId].start;

    data[userId].total += duration;
    data[userId].sessions.push({
      start: data[userId].start,
      end,
      duration
    });

    data[userId].start = null;
    saveData();

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            `🔴 <@${userId}> is now **OFFLINE**\n\n` +
            `🟢 Online: ${time(data[userId].sessions.at(-1).start)}\n` +
            `🔴 Offline: ${time(end)}\n` +
            `⏱ Duration: ${format(duration)}`
          )
          .setTimestamp()
      ]
    });
  }

  // /status
  if (interaction.commandName === "status") {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Blue")
          .setTitle("📊 Attendance Status")
          .setDescription(
            `Total Time: ${format(data[userId].total)}\n` +
            `Currently Online: ${data[userId].start ? "Yes" : "No"}`
          )
          .setTimestamp()
      ]
    });
  }

  // /history
  if (interaction.commandName === "history") {
    const sessions = data[userId].sessions.slice(-5).reverse();

    if (!sessions.length)
      return interaction.reply({ content: "No attendance history found.", ephemeral: true });

    const desc = sessions.map((s, i) =>
      `**${i + 1}.** 🟢 ${time(s.start)} → 🔴 ${time(s.end)} | ${format(s.duration)}`
    ).join("\n");

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Purple")
          .setTitle("🕒 Attendance History")
          .setDescription(desc)
          .setTimestamp()
      ]
    });
  }

  // /help
  if (interaction.commandName === "help") {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Gold")
          .setTitle("📌 Attendance Bot Help")
          .setDescription(
            "**Commands:**\n" +
            "`online` or `/online` → Start attendance\n" +
            "`offline` or `/offline` → Stop attendance\n" +
            "`/status` → Check your total time\n" +
            "`/history` → View online-offline timings\n\n" +
            "**Tip:** Text and slash commands both work!"
          )
      ],
      ephemeral: true
    });
  }
});

// ================== LOGIN ==================
client.once("ready", () =>
  console.log(`Logged in as ${client.user.tag}`)
);

client.login(TOKEN);
