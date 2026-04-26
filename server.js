require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const axios = require("axios");
const speakeasy = require("speakeasy");
const crypto = require("crypto");
const { ethers } = require("ethers");
const TronWeb = require("tronweb");

const app = express();
app.use(express.json());
app.use(cors());
const PORT = process.env.PORT || 8080;

// ==================== MONGODB ====================
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// ==================== SCHEMAS ====================
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  userId: String,
  balance: { type: Number, default: 0 },
  totalDeposit: { type: Number, default: 0 },
  twoFactorSecret: String,
  twoFactorEnabled: { type: Boolean, default: false },
  referralCode: String,
  referredBy: String,
  referralEarnings: { type: Number, default: 0 },
  referralCount: { type: Number, default: 0 },
  rank: { type: String, default: "TRAINEE" },
  botPlan: { type: String, default: "None" },
  paymentPassword: String,
  withdrawalCode: String,
  withdrawalCodeExpiry: Date,
  resetCode: String,
  resetExpiry: Date,
  bep20Address: String,
  trc20Address: String,
  transactions: [{
    type: String,
    amount: Number,
    txid: String,
    status: String,
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", userSchema);

const adminSchema = new mongoose.Schema({
  email: String,
  password: String
});
const Admin = mongoose.model("Admin", adminSchema);

const announcementSchema = new mongoose.Schema({
  title: String,
  message: String,
  createdAt: { type: Date, default: Date.now }
});
const Announcement = mongoose.model("Announcement", announcementSchema);

const complaintSchema = new mongoose.Schema({
  user: String,
  message: String,
  createdAt: { type: Date, default: Date.now }
});
const Complaint = mongoose.model("Complaint", complaintSchema);

const kycSchema = new mongoose.Schema({
  userId: String,
  file: String,
  status: { type: String, default: "pending" },
  createdAt: { type: Date, default: Date.now }
});
const KYC = mongoose.model("KYC", kycSchema);

// ==================== EMAIL ====================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});
async function sendEmail(to, subject, text) {
  await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, text });
}

// ==================== TELEGRAM ====================
async function sendTelegramAlert(text) {
  await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    chat_id: process.env.TELEGRAM_CHAT_ID,
    text: text
  });
}

// ==================== WALLET GENERATION ====================
function generateBEP20Wallet() {
  const wallet = ethers.Wallet.createRandom();
  return { address: wallet.address, privateKey: wallet.privateKey };
}
async function generateTRC20Wallet() {
  const tronWeb = new TronWeb({ fullHost: "https://api.trongrid.io" });
  const account = await tronWeb.createAccount();
  return { address: account.address.base58, privateKey: account.privateKey };
}

// ==================== BINANCE AUTO-FORWARD ====================
async function forwardToBinance(userId, amount, address) {
  const timestamp = Date.now();
  const queryString = `coin=USDT&amount=${amount}&address=${address}&timestamp=${timestamp}`;
  const signature = crypto.createHmac('sha256', process.env.BINANCE_SECRET_KEY_FORWARD)
    .update(queryString).digest('hex');

  await axios.post("https://api.binance.com/sapi/v1/capital/withdraw/apply", null, {
    params: { coin: "USDT", amount, address, timestamp, signature },
    headers: { "X-MBX-APIKEY": process.env.BINANCE_API_KEY_FORWARD }
  });
  await sendTelegramAlert(`🔄 Auto-forward: $${amount} from ${userId} to Binance`);
}

// ==================== RANK UPDATE ====================
async function updateUserRank(userId) {
  const user = await User.findOne({ userId });
  if (!user) return;

  const totalReferrals = user.referralCount;
  const totalDeposit = user.totalDeposit;

  if (totalReferrals >= 20) user.rank = "SILVER";
  else if (totalReferrals >= 5 || totalDeposit >= 100) user.rank = "BEGINNER";
  else user.rank = "TRAINEE";

  if (user.rank === "SILVER") {
    const silverCount = await User.countDocuments({ referredBy: user.userId, rank: "SILVER" });
    if (silverCount >= 5) user.rank = "GOLD";
  }
  if (user.rank === "GOLD") {
    const goldCount = await User.countDocuments({ referredBy: user.userId, rank: "GOLD" });
    if (goldCount >= 10) user.rank = "DIAMOND";
  }
  if (user.rank === "DIAMOND") {
    const diamondCount = await User.countDocuments({ referredBy: user.userId, rank: "DIAMOND" });
    if (diamondCount >= 5) user.rank = "MANAGER";
  }
  await user.save();
}

// ==================== AUTH ====================
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const userId = "HK" + Math.floor(Math.random() * 10000);
  const referralCode = "REF" + userId;
  const bep20Wallet = generateBEP20Wallet();
  const trc20Wallet = await generateTRC20Wallet();

  const user = new User({
    name, email, password: hashed, userId, referralCode,
    bep20Address: bep20Wallet.address,
    trc20Address: trc20Wallet.address
  });
  await user.save();
  res.json({ success: true, user });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.json({ success: false, message: "User not found" });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.json({ success: false, message: "Invalid password" });
  res.json({ success: true, user });
});

// ==================== PASSWORD RESET ====================
app.post("/api/auth/reset-password-request", async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.json({ success: false, message: "User not found" });
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  user.resetCode = code;
  user.resetExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();
  await sendEmail(user.email, "Password Reset Code", `Your reset code: ${code}`);
  res.json({ success: true, message: "Reset code sent" });
});

app.post("/api/auth/reset-password-confirm", async (req, res) => {
  const { email, code, newPassword } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.json({ success: false, message: "User not found" });
  if (user.resetCode !== code || user.resetExpiry < new Date())
    return res.json({ success: false, message: "Invalid or expired code" });
  user.password = await bcrypt.hash(newPassword, 10);
  user.resetCode = null;
  user.resetExpiry = null;
  await user.save();
  res.json({ success: true, message: "Password updated" });
});

// ==================== DEPOSIT ====================
app.post("/api/deposit", async (req, res) => {
  const { userId, amount, txid } = req.body;
  const user = await User.findOne({ userId });
  if (!user) return res.json({ success: false, message: "User not found" });
  user.balance += amount;
  user.totalDeposit += amount;
  user.transactions.push({ type: "deposit", amount, txid, status: "completed" });
  await user.save();
  await updateUserRank(userId);
  await sendTelegramAlert(`📥 Deposit: $${amount} by ${user.email} (TXID: ${txid})`);
  res.json({ success: true, message: "Deposit recorded" });
});

app.post("/api/deposit/forward", async (req, res) => {
  const { userId, amount, address } = req.body;
  await forwardToBinance(userId, amount, address);
  res.json({ success: true, message: "Forwarded to Binance" });
});

// ==================== RENT BOT ====================
app.post("/api/rent-bot", async (req, res) => {
  const { userId, botName, botPrice } = req.body;
  const user = await User.findOne({ userId });
  if (!user) return res.json({ success: false, message: "User not found" });
  user.botPlan = botName;
  user.balance -= botPrice;
  user.transactions.push({ type: "rent", amount: botPrice, txid: botName, status: "completed" });
  await user.save();
  res.json({ success: true, message: `Bot ${botName} rented` });
});

// Daily profit cron (24h)
setInterval(async () => {
  const users = await User.find({ botPlan: { $ne: "None" } });
  for (const u of users) {
    let profit = 0;
    if (u.botPlan === "Nano Bot") profit = 1;
    if (u.botPlan === "Alpha Bot") profit = 3.5;
    if (u.botPlan === "Legend Bot") profit = 23;
    u.balance += profit;
    u.transactions.push({ type: "profit", amount: profit, txid: "daily", status: "completed" });
    await u.save();
  }
}, 24 * 60 * 60 * 1000);

// ==================== WITHDRAW ====================
app.post("/api/withdraw/request", async (req, res) => {
  const { userId } = req.body;
  const user = await User.findOne({ userId });
  if (!user) return res.json({ success: false, message: "User not found" });
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  user.withdrawalCode = code;
  user.withdrawalCodeExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();
  await sendEmail(user.email, "Withdrawal Code", `Your code: ${code}`);
  res.json({ success: true, message: "Code sent" });
});

app.post("/api/withdraw/confirm", async (req, res) => {
  const { userId, amount, address, emailCode, twoFACode, paymentPassword } = req.body;
  const user = await User.findOne({ userId });
  if (!user) return res.json({ success: false, message: "User not found" });
  if (user.withdrawalCode !== emailCode) return res.json({ success: false, message: "Invalid email code" });
  if (user.withdrawalCodeExpiry < new Date()) return res.json({ success: false, message: "Code expired" });
  if (user.twoFactorEnabled) {
    const valid2FA = speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: "base32", token: twoFACode });
    if (!valid2FA) return res.json({ success: false, message: "Invalid 2FA" });
  }
  const validPass = await bcrypt.compare(paymentPassword, user.paymentPassword);
  if (!validPass) return res.json({ success: false, message: "Invalid payment password" });
  if (user.balance < amount) return res.json({ success: false, message: "Insufficient balance" });
  user.balance -= amount;
  user.transactions.push({ type: "withdraw", amount, txid: address, status: "pending" });
  await user.save();
  await sendTelegramAlert(`📤 Withdrawal Request: $${amount} from ${user.email} pending admin approval`);
  res.json({ success: true, message: "Withdrawal pending admin approval" });
});

// ==================== REFERRAL ====================
app.get("/api/referral/:userId", async (req, res) => {
  const user = await User.findOne({ userId: req.params.userId });
  if (!user) return res.json({ success: false, message: "User not found" });
  res.json({ success: true, referrals: user.referralCount, earnings: user.referralEarnings, rank: user.rank });
});

// ==================== HISTORY ====================
app.get("/api/history/:userId", async (req, res) => {
  const user = await User.findOne({ userId: req.params.userId });
  if (!user) return res.json({ success: false, message: "User not found" });
  res.json({ success: true, transactions: user.transactions });
});

// ==================== ADMIN ====================
app.get("/api/admin/users", async (req, res) => {
  const users = await User.find({});
  res.json({ success: true, users });
});

app.post("/api/admin/withdraw/approve", async (req, res) => {
  const { userId, txid } = req.body;
  const user = await User.findOne({ userId });
  if (!user) return res.json({ success: false, message: "User not found" });
  const tx = user.transactions.find(t => t.txid === txid && t.status === "pending");
  if (!tx) return res.json({ success: false, message: "Transaction not found" });
  tx.status = "completed";
  await user.save();
  await sendEmail(user.email, "Withdrawal Approved", `Your withdrawal of $${tx.amount} approved`);
  res.json({ success: true, message: "Withdrawal approved" });
});

app.post("/api/admin/announcement", async (req, res) => {
  const { title, message } = req.body;
  const ann = new Announcement({ title, message });
  await ann.save();
  res.json({ success: true, announcement: ann });
});

app.get("/api/announcements", async (req, res) => {
  const anns = await Announcement.find({});
  res.json({ success: true, announcements: anns });
});

app.get("/api/admin/complaints", async (req, res) => {
  const complaints = await Complaint.find({});
  res.json({ success: true, complaints });
});

app.get("/api/admin/kyc", async (req, res) => {
  const kycs = await KYC.find({});
  res.json({ success: true, kycs });
});

app.post("/api/admin/kyc/approve", async (req, res) => {
  const { kycId } = req.body;
  const kyc = await KYC.findById(kycId);
  if (!kyc) return res.json({ success: false, message: "KYC not found" });
  kyc.status = "approved";
  await kyc.save();
  res.json({ success: true, message: "KYC approved" });
});

// ==================== COMPLAINTS ====================
app.post("/api/complaint", async (req, res) => {
  const { user, message } = req.body;
  const c = new Complaint({ user, message });
  await c.save();
  await sendTelegramAlert(`⚠️ Complaint from ${user}: ${message}`);
  res.json({ success: true, complaint: c });
});

// ==================== KYC ====================
app.post("/api/kyc/upload", async (req, res) => {
  const { userId, file } = req.body;
  const kyc = new KYC({ userId, file });
  await kyc.save();
  await sendTelegramAlert(`🪪 KYC submitted by ${userId}`);
  res.json({ success: true, message: "KYC submitted" });
});

// ==================== HEALTH CHECK ====================
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// ==================== SERVER RUN ====================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`✅ MongoDB: ${mongoose.connection.readyState === 1 ? "Connected" : "Disconnected"}`);
});
