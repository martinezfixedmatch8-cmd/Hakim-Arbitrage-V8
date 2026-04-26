require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const axios = require("axios");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ DB Error:", err));

// ==================== EMAIL SETUP ====================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

async function sendEmail(to, subject, text) {
  await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, html: text });
}

// ==================== TELEGRAM ====================
async function sendTelegram(text) {
  await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    chat_id: process.env.TELEGRAM_CHAT_ID,
    text: text
  });
}

// ==================== USER MODEL ====================
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  balance: { type: Number, default: 0 },
  totalDeposit: { type: Number, default: 0 },
  walletBEP20: String,
  walletTRC20: String,
  referralCode: String,
  referredBy: String,
  referrals: [{ type: String }],
  referralEarnings: { type: Number, default: 0 },
  kycVerified: { type: Boolean, default: false },
  paymentPassword: String,
  twoFASecret: String,
  twoFAEnabled: { type: Boolean, default: false },
  withdrawOTP: String,
  withdrawOTPExpiry: Date,
  botActive: { type: Boolean, default: false },
  botPlan: { type: String, default: "None" },
  rank: { type: String, default: "TRAINEE" },
  transactions: [{
    type: String,
    amount: Number,
    status: String,
    txid: String,
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

// ==================== AUTH MIDDLEWARE ====================
function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(token, "SECRET_KEY");
    next();
  } catch {
    res.status(403).json({ error: "Invalid token" });
  }
}

// ==================== REGISTER ====================
app.post("/api/register", async (req, res) => {
  const { name, email, password, ref } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const referralCode = Math.random().toString(36).substring(2, 10).toUpperCase();
  const walletBEP20 = "0x" + crypto.randomBytes(20).toString("hex");
  const walletTRC20 = "T" + crypto.randomBytes(20).toString("hex").substring(0, 33);

  let referredBy = null;
  if (ref) {
    const referrer = await User.findOne({ referralCode: ref });
    if (referrer) {
      referredBy = referrer.referralCode;
      referrer.referrals.push(email);
      await referrer.save();
    }
  }

  const user = new User({ name, email, password: hashed, referralCode, walletBEP20, walletTRC20, referredBy });
  await user.save();

  await sendTelegram(`🆕 New user: ${name} (${email})`);
  res.json({ success: true, user });
});

// ==================== LOGIN ====================
app.post("/api/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) return res.status(400).json({ error: "User not found" });
  const valid = await bcrypt.compare(req.body.password, user.password);
  if (!valid) return res.status(400).json({ error: "Wrong password" });
  const token = jwt.sign({ id: user._id }, "SECRET_KEY");
  res.json({ token, user: { id: user._id, name: user.name, email: user.email, balance: user.balance, rank: user.rank, referralCode: user.referralCode } });
});

// ==================== GET USER ====================
app.get("/api/user", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json(user);
});

// ==================== GET USER BY ID ====================
app.get("/api/user/:id", async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ name: user.name, balance: user.balance, rank: user.rank, referralCode: user.referralCode });
});

// ==================== 2FA SETUP ====================
app.get("/api/2fa/setup", auth, async (req, res) => {
  const secret = speakeasy.generateSecret({ length: 20 });
  await User.findByIdAndUpdate(req.user.id, { twoFASecret: secret.base32 });
  const qr = await QRCode.toDataURL(secret.otpauth_url);
  res.json({ qr, secret: secret.base32 });
});

app.post("/api/2fa/verify", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  const verified = speakeasy.totp.verify({ secret: user.twoFASecret, encoding: "base32", token: req.body.code });
  if (!verified) return res.status(400).json({ error: "Invalid code" });
  user.twoFAEnabled = true;
  await user.save();
  res.json({ success: true });
});

// ==================== WITHDRAW OTP ====================
app.post("/api/withdraw/otp", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  user.withdrawOTP = otp;
  user.withdrawOTPExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();
  await sendEmail(user.email, "Withdrawal OTP Code", `<h2>Your OTP: ${otp}</h2><p>Valid for 10 minutes.</p>`);
  res.json({ success: true });
});

// ==================== CONFIRM WITHDRAW ====================
app.post("/api/withdraw/confirm", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  const { amount, address, otp, twoFACode } = req.body;

  if (amount < 10) return res.status(400).json({ error: "Minimum $10" });
  if (user.balance < amount) return res.status(400).json({ error: "Insufficient balance" });
  if (user.withdrawOTP !== otp || user.withdrawOTPExpiry < new Date()) return res.status(400).json({ error: "Invalid OTP" });

  if (user.twoFAEnabled) {
    const valid2FA = speakeasy.totp.verify({ secret: user.twoFASecret, encoding: "base32", token: twoFACode });
    if (!valid2FA) return res.status(400).json({ error: "Invalid 2FA" });
  }

  user.balance -= amount;
  user.transactions.push({ type: "withdraw", amount, status: "pending", txid: address });
  await user.save();

  await sendTelegram(`📤 Withdrawal request: $${amount} from ${user.email} to ${address}`);
  res.json({ success: true, message: "Withdrawal pending admin approval" });
});

// ==================== DEPOSIT SCAN (BSCScan) ====================
async function scanDeposits() {
  const users = await User.find();
  for (const user of users) {
    const url = `https://api.bscscan.com/api?module=account&action=txlist&address=${user.walletBEP20}&apikey=${process.env.BSCSCAN_API_KEY}`;
    try {
      const res = await axios.get(url);
      const txs = res.data.result || [];
      for (const tx of txs) {
        const exists = user.transactions.find(t => t.txid === tx.hash);
        if (tx.to.toLowerCase() === user.walletBEP20.toLowerCase() && !exists) {
          const amount = parseFloat(tx.value) / 1e18;
          if (amount > 0) {
            user.balance += amount;
            user.totalDeposit += amount;
            user.transactions.push({ type: "deposit", amount, status: "completed", txid: tx.hash });
            await user.save();
            await sendTelegram(`💰 Deposit: $${amount} from ${user.email}`);
            await updateUserRank(user._id);
          }
        }
      }
    } catch (err) { console.error("Scan error:", err.message); }
  }
}
setInterval(scanDeposits, 60000);

// ==================== RANK UPDATE ====================
async function updateUserRank(userId) {
  const user = await User.findById(userId);
  if (!user) return;
  const refCount = user.referrals.length;
  const deposit = user.totalDeposit;

  if (deposit >= 50000) user.rank = "MANAGER";
  else if (deposit >= 20000) user.rank = "DIAMOND";
  else if (deposit >= 10000) user.rank = "GOLD";
  else if (deposit >= 2000) user.rank = "SILVER";
  else if (refCount >= 5 || deposit >= 100) user.rank = "BEGINNER";
  else user.rank = "TRAINEE";
  await user.save();
}

// ==================== RENT BOT ====================
app.post("/api/rent-bot", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  const { botName, botPrice } = req.body;
  if (user.balance < botPrice) return res.status(400).json({ error: "Insufficient balance" });

  user.balance -= botPrice;
  user.botPlan = botName;
  user.botActive = true;
  await user.save();

  // Referral commission (10%)
  if (user.referredBy) {
    const referrer = await User.findOne({ referralCode: user.referredBy });
    if (referrer) {
      const commission = botPrice * 0.10;
      referrer.balance += commission;
      referrer.referralEarnings += commission;
      await referrer.save();
      await sendTelegram(`💰 Referral commission: $${commission} to ${referrer.email}`);
    }
  }

  res.json({ success: true, newBalance: user.balance });
});

// ==================== TRADING ENGINE (Binance API) ====================
async function getPrice(symbol) {
  try {
    const res = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    return parseFloat(res.data.price);
  } catch { return null; }
}

async function tradingEngine() {
  const users = await User.find({ botActive: true });
  const btcPrice = await getPrice("BTCUSDT");
  if (!btcPrice) return;

  for (const user of users) {
    let profitPercent = 0.005 + Math.random() * 0.025; // 0.5% - 3%
    let profit = user.totalDeposit * profitPercent;
    if (profit < 0.5) profit = 0.5;

    user.balance += profit;
    user.transactions.push({ type: "profit", amount: profit, status: "completed" });
    await user.save();
  }
  console.log("✅ Trading engine executed", new Date().toISOString());
}
setInterval(tradingEngine, 300000); // every 5 minutes

// ==================== ADMIN - GET ALL USERS ====================
app.get("/api/admin/users", async (req, res) => {
  const users = await User.find({}).sort({ createdAt: -1 });
  res.json(users);
});

// ==================== ADMIN - APPROVE WITHDRAW ====================
app.post("/api/admin/withdraw/approve", async (req, res) => {
  const { userId, txid } = req.body;
  const user = await User.findOne({ _id: userId });
  const tx = user.transactions.find(t => t.txid === txid && t.status === "pending");
  if (tx) {
    tx.status = "completed";
    await user.save();
    await sendEmail(user.email, "Withdrawal Approved", `Your withdrawal of $${tx.amount} has been approved.`);
    await sendTelegram(`✅ Withdrawal approved: $${tx.amount} for ${user.email}`);
  }
  res.json({ success: true });
});

// ==================== ADMIN - APPROVE KYC ====================
app.post("/api/admin/kyc/approve", async (req, res) => {
  const { userId } = req.body;
  await User.findByIdAndUpdate(userId, { kycVerified: true });
  res.json({ success: true });
});

// ==================== LEADERBOARD ====================
app.get("/api/leaderboard", async (req, res) => {
  const users = await User.find({}).sort({ totalDeposit: -1 }).limit(20);
  res.json(users.map(u => ({ name: u.name, balance: u.balance, rank: u.rank, referrals: u.referrals.length })));
});

// ==================== REFERRAL INFO ====================
app.get("/api/referral/:userId", async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  const referrals = await User.find({ referredBy: user.referralCode });
  res.json({ code: user.referralCode, count: referrals.length, earnings: user.referralEarnings, referrals: referrals.map(r => ({ name: r.name, email: r.email })) });
});

// ==================== HEALTH CHECK ====================
app.get("/api/health", (req, res) => res.json({ status: "OK" }));

app.listen(process.env.PORT || 8080, () => console.log("🚀 Server running"));
