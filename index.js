// ==============================
// CONFIG
// ==============================
const CONFIG = {
  PREFIX: '!',
  SERVER_TITLE: 'EMG GC 2',

  XP_PER_MESSAGE: 3,
  XP_PER_VOICE_MINUTE: 3,
  MESSAGE_COOLDOWN_MS: 5000,

  XP_MULTIPLIER: 100, // level 1->2 = 100, 2->3 = 200, 3->4 = 300...

  ENABLE_VOICE_XP: true,
  REQUIRE_2_MEMBERS_IN_VOICE: true,
  DISABLE_LEVEL_UP_MESSAGES: true
};

// ==============================
// IMPORTS
// ==============================
const { Client, GatewayIntentBits, AttachmentBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

// ==============================
// TOKEN
// ==============================
// بدل هاد التوكن بالتوكن الجديد ديالك
const TOKEN = "MTQ4OTY5NDQxMTQ3MzQyNDQwNg.GOFqoj.zUbAuMglnd9lBi7ULM3v_IRgxzeXiCpLINmGmY";

// ==============================
// CLIENT
// ==============================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ==============================
// DATA
// ==============================
let data = {};
let cooldown = {};

if (fs.existsSync('xp.json')) {
  data = JSON.parse(fs.readFileSync('xp.json', 'utf8'));
}

// ==============================
// READY
// ==============================
client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);

  if (CONFIG.ENABLE_VOICE_XP) {
    setInterval(giveVoiceXp, 60000);
  }
});

// ==============================
// HELPERS
// ==============================
function saveData() {
  fs.writeFileSync('xp.json', JSON.stringify(data, null, 2));
}

function ensureUser(userId) {
  if (!data[userId]) {
    data[userId] = { xp: 0, level: 1 };
  }
}

function totalXpForLevel(level) {
  if (level <= 1) return 0;
  return ((level - 1) * level * CONFIG.XP_MULTIPLIER) / 2;
}

function getProgressData(stats) {
  const currentLevelTotal = totalXpForLevel(stats.level);
  const nextLevelTotal = totalXpForLevel(stats.level + 1);
  const currentXp = Math.max(stats.xp - currentLevelTotal, 0);
  const neededXp = Math.max(nextLevelTotal - currentLevelTotal, 1);
  const progress = Math.min(Math.max(currentXp / neededXp, 0), 1);

  return {
    currentXp,
    neededXp,
    progress
  };
}

function getUserRank(userId) {
  const sorted = Object.entries(data).sort((a, b) => b[1].xp - a[1].xp);
  const rankIndex = sorted.findIndex(entry => entry[0] === userId);
  return rankIndex === -1 ? 'N/A' : rankIndex + 1;
}

function getRankImageByLevel(level) {
  if (level >= 1 && level <= 5) return 'rank1.png';
  if (level >= 6 && level <= 10) return 'rank2.png';
  if (level >= 11 && level <= 15) return 'rank3.png';
  if (level >= 16 && level <= 20) return 'rank4.png';
  return 'rank5.png';
}

function isAdmin(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

async function handleLevelUp(member, userId) {
  ensureUser(userId);

  let leveledUp = false;

  while (data[userId].xp >= totalXpForLevel(data[userId].level + 1)) {
    data[userId].level += 1;
    leveledUp = true;
  }

  if (leveledUp && member) {
    await updateLevelRole(member, data[userId].level);
  }
}

async function updateLevelRole(member, level) {
  if (!member) return;

  const levelRoleName = `level ${level}`;
  const newRole = member.guild.roles.cache.find(
    role => role.name.toLowerCase() === levelRoleName.toLowerCase()
  );

  if (!newRole) return;

  const oldLevelRoles = member.roles.cache.filter(role =>
    /^level\s+\d+$/i.test(role.name) && role.id !== newRole.id
  );

  try {
    if (oldLevelRoles.size > 0) {
      await member.roles.remove(oldLevelRoles);
    }

    if (!member.roles.cache.has(newRole.id)) {
      await member.roles.add(newRole);
    }
  } catch (error) {
    console.log('Role update error:', error.message);
  }
}

function roundRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function drawCircleImage(ctx, image, x, y, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
}

// ==============================
// LEADERBOARD IMAGE
// ==============================
async function generateLeaderboardImage(guild) {
  const sorted = Object.entries(data)
    .sort((a, b) => b[1].xp - a[1].xp)
    .slice(0, 10);

  const width = 1100;
  const rowHeight = 100;
  const headerHeight = 150;
  const height = headerHeight + Math.max(sorted.length, 1) * rowHeight + 40;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#050b16');
  bg.addColorStop(0.5, '#0b1220');
  bg.addColorStop(1, '#111827');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(59,130,246,0.25)';
  ctx.lineWidth = 2;
  roundRect(ctx, 18, 18, width - 36, height - 36, 26);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  roundRect(ctx, 25, 25, width - 50, height - 50, 26);
  ctx.fill();

  const topGlow = ctx.createLinearGradient(0, 0, width, 0);
  topGlow.addColorStop(0, 'rgba(59,130,246,0.00)');
  topGlow.addColorStop(0.5, 'rgba(34,211,238,0.35)');
  topGlow.addColorStop(1, 'rgba(59,130,246,0.00)');
  ctx.fillStyle = topGlow;
  roundRect(ctx, 40, 35, width - 80, 6, 3);
  ctx.fill();

  try {
    const logo = await loadImage('./logo.png');
    ctx.drawImage(logo, width - 185, 18, 135, 135);
  } catch (error) {
    console.log('Logo load error:', error.message);
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = 'italic bold 42px Arial';
  ctx.fillText(CONFIG.SERVER_TITLE, 45, 58);

  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 40px Arial';
  ctx.fillText('LEADERBOARD', 45, 103);

  ctx.fillStyle = '#93c5fd';
  ctx.font = '22px Arial';
  ctx.fillText('Top 10 Members', 48, 133);

  for (let i = 0; i < sorted.length; i++) {
    const [userId, stats] = sorted[i];
    const member = await guild.members.fetch(userId).catch(() => null);
    const user = member?.user;
    const y = headerHeight + i * rowHeight;

    let rankColor = '#ffffff';
    let glowColor = 'rgba(255,255,255,0.08)';
    let cardFill = 'rgba(255,255,255,0.06)';

    if (i === 0) {
      rankColor = '#facc15';
      glowColor = 'rgba(250,204,21,0.25)';
      cardFill = 'rgba(250,204,21,0.15)';
    } else if (i === 1) {
      rankColor = '#d1d5db';
      glowColor = 'rgba(209,213,219,0.22)';
      cardFill = 'rgba(209,213,219,0.13)';
    } else if (i === 2) {
      rankColor = '#fb923c';
      glowColor = 'rgba(251,146,60,0.22)';
      cardFill = 'rgba(251,146,60,0.13)';
    }

    if (i < 3) {
      ctx.save();
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 28;
      ctx.fillStyle = glowColor;
      roundRect(ctx, 38, y - 2, width - 76, 86, 22);
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = cardFill;
    roundRect(ctx, 40, y, width - 80, 82, 20);
    ctx.fill();

    ctx.strokeStyle = i < 3 ? `${rankColor}66` : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = i < 3 ? 2 : 1.5;
    roundRect(ctx, 40, y, width - 80, 82, 20);
    ctx.stroke();

    ctx.fillStyle = 'rgba(15,23,42,0.90)';
    roundRect(ctx, 55, y + 16, 82, 50, 14);
    ctx.fill();

    ctx.strokeStyle = `${rankColor}88`;
    ctx.lineWidth = 2;
    roundRect(ctx, 55, y + 16, 82, 50, 14);
    ctx.stroke();

    ctx.fillStyle = rankColor;
    ctx.font = 'bold 30px Arial';
    ctx.fillText(`#${i + 1}`, 72, y + 50);

    if (user) {
      const avatarURL = user.displayAvatarURL({ extension: 'png', size: 128 });
      try {
        const avatar = await loadImage(avatarURL);

        ctx.beginPath();
        ctx.arc(185, y + 41, i < 3 ? 35 : 33, 0, Math.PI * 2);
        ctx.fillStyle = i < 3 ? glowColor : 'rgba(59,130,246,0.22)';
        ctx.fill();

        drawCircleImage(ctx, avatar, 185, y + 41, 28);
      } catch (error) {}
    }

    const displayName = user ? `@${user.username}` : 'Unknown User';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 29px Arial';
    ctx.fillText(displayName, 235, y + 34);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '21px Arial';
    ctx.fillText(`LVL: ${stats.level}  •  XP: ${stats.xp}`, 238, y + 63);

    const progressData = getProgressData(stats);

    ctx.fillStyle = '#93c5fd';
    ctx.font = '18px Arial';
    ctx.fillText(`${progressData.currentXp}/${progressData.neededXp}`, 860, y + 28);

    ctx.fillStyle = '#0f172a';
    roundRect(ctx, 760, y + 42, 260, 16, 8);
    ctx.fill();

    const progressGradient = ctx.createLinearGradient(760, y, 1020, y);
    progressGradient.addColorStop(0, i === 0 ? '#facc15' : i === 1 ? '#94a3b8' : i === 2 ? '#fb923c' : '#2563eb');
    progressGradient.addColorStop(1, i === 0 ? '#fde68a' : i === 1 ? '#e5e7eb' : i === 2 ? '#fdba74' : '#22d3ee');
    ctx.fillStyle = progressGradient;
    roundRect(ctx, 760, y + 42, 260 * progressData.progress, 16, 8);
    ctx.fill();
  }

  return canvas.toBuffer('image/png');
}

// ==============================
// RANK CARD IMAGE
// ==============================
async function generateRankCard(member, stats) {
  const width = 1000;
  const height = 350;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#0a1120');
  bg.addColorStop(0.5, '#101a2f');
  bg.addColorStop(1, '#050b16');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  roundRect(ctx, 20, 20, 960, 310, 30);
  ctx.fill();

  ctx.strokeStyle = 'rgba(59,130,246,0.18)';
  ctx.lineWidth = 2;
  roundRect(ctx, 20, 20, 960, 310, 30);
  ctx.stroke();

  try {
    const logo = await loadImage('./logo.png');
    ctx.drawImage(logo, 40, 40, 80, 80);
  } catch (error) {
    console.log('Logo load error:', error.message);
  }

  const avatar = await loadImage(member.user.displayAvatarURL({ extension: 'png', size: 256 }));
  drawCircleImage(ctx, avatar, 120, 185, 70);

  const rank = getUserRank(member.user.id);
  const progressData = getProgressData(stats);
  const rankImage = getRankImageByLevel(stats.level);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px Arial';
  ctx.fillText(member.user.username, 220, 110);

  ctx.fillStyle = '#93c5fd';
  ctx.font = '18px Arial';
  ctx.fillText(`ID: ${member.user.id}`, 220, 140);

  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 28px Arial';
  ctx.fillText(`RANK: #${rank}`, 220, 190);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px Arial';
  ctx.fillText(`LEVEL: ${stats.level}`, 420, 190);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '28px Arial';
  ctx.fillText(`XP: ${stats.xp}`, 650, 190);

  ctx.fillStyle = '#93c5fd';
  ctx.font = '20px Arial';
  ctx.fillText(`${progressData.currentXp} / ${progressData.neededXp} XP`, 220, 235);

  ctx.fillStyle = '#1e293b';
  roundRect(ctx, 220, 250, 680, 26, 13);
  ctx.fill();

  const gradient = ctx.createLinearGradient(220, 250, 900, 250);
  gradient.addColorStop(0, '#3b82f6');
  gradient.addColorStop(0.5, '#38bdf8');
  gradient.addColorStop(1, '#22d3ee');
  ctx.fillStyle = gradient;
  roundRect(ctx, 220, 250, 680 * progressData.progress, 26, 13);
  ctx.fill();

  try {
    const rankBadge = await loadImage(`./${rankImage}`);
    ctx.save();
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 30;
    ctx.drawImage(rankBadge, 820, 90, 130, 130);
    ctx.restore();
  } catch (e) {
    console.log('Rank image error:', e.message);
  }

  return canvas.toBuffer('image/png');
}

// ==============================
// VOICE XP
// ==============================
function giveVoiceXp() {
  if (!CONFIG.ENABLE_VOICE_XP) return;

  client.guilds.cache.forEach((guild) => {
    guild.voiceStates.cache.forEach(async (voiceState) => {
      const member = voiceState.member;
      if (!member || member.user.bot) return;
      if (!voiceState.channel) return;
      if (voiceState.selfDeaf || voiceState.serverDeaf) return;
      if (voiceState.selfMute || voiceState.serverMute) return;

      if (CONFIG.REQUIRE_2_MEMBERS_IN_VOICE) {
        const realMembers = voiceState.channel.members.filter(m => !m.user.bot);
        if (realMembers.size < 2) return;
      }

      const userId = member.id;
      ensureUser(userId);

      data[userId].xp += CONFIG.XP_PER_VOICE_MINUTE;
      await handleLevelUp(member, userId);
      saveData();
    });
  });
}

// ==============================
// EVENTS
// ==============================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const userId = message.author.id;
  ensureUser(userId);

  // !rank OR !rand
  if (
    message.content.startsWith(`${CONFIG.PREFIX}rank`) ||
    message.content.startsWith(`${CONFIG.PREFIX}rand`)
  ) {
    const target = message.mentions.members.first() || message.member;
    const targetId = target.id;

    ensureUser(targetId);

    const buffer = await generateRankCard(target, data[targetId]);
    const attachment = new AttachmentBuilder(buffer, { name: 'rank.png' });

    return message.channel.send({ files: [attachment] });
  }

  // !leaderboard => image only
  if (message.content === `${CONFIG.PREFIX}leaderboard`) {
    const buffer = await generateLeaderboardImage(message.guild);
    const attachment = new AttachmentBuilder(buffer, { name: 'leaderboard.png' });

    return message.channel.send({
      files: [attachment]
    });
  }

  // !addxp @user 50
  if (message.content.startsWith(`${CONFIG.PREFIX}addxp`)) {
    if (!isAdmin(message.member)) {
      return message.reply('❌ You do not have permission to use this command.');
    }

    const target = message.mentions.members.first();
    const args = message.content.trim().split(/\s+/);
    const amount = parseInt(args[2], 10);

    if (!target) {
      return message.reply(`⚠️ Usage: ${CONFIG.PREFIX}addxp @user 50`);
    }

    if (isNaN(amount) || amount <= 0) {
      return message.reply('⚠️ XP amount must be a number greater than 0.');
    }

    const targetId = target.id;
    ensureUser(targetId);

    data[targetId].xp += amount;
    await handleLevelUp(target, targetId);
    saveData();

    return message.channel.send(`✅ Added **${amount} XP** to **${target.user.username}**.`);
  }

  if (message.content.startsWith(CONFIG.PREFIX)) return;

  if (cooldown[userId] && Date.now() - cooldown[userId] < CONFIG.MESSAGE_COOLDOWN_MS) return;
  cooldown[userId] = Date.now();

  data[userId].xp += CONFIG.XP_PER_MESSAGE;
  await handleLevelUp(message.member, userId);
  saveData();
});

// ==============================
// START
// ==============================
client.login(TOKEN);