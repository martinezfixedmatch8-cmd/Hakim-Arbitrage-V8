require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const axios = require("axios");
const crypto = require("crypto");
const speakeasy = require("speakeasy");

// Web3 v4.x - DESTRUCTURE FIX!
const { Web3 } = require("web3");
const TronWeb = require("tronweb");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 8080;

// ==================== MONGODB ====================
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// ==================== WEB3 SETUP ====================
const bsc = new Web3("https://bsc-dataseed.binance.org/");
const tronWeb = new TronWeb({ fullHost: "https://api.trongrid.io" });

// ==================== USER SCHEMA ====================
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    userId: { type: String, unique: true },
    balance: { type: Number, default: 0 },
    totalDeposit: { type: Number, default: 0 },
    twoFactorSecret: { type: String, default: null },
    twoFactorEnabled: { type: Boolean, default: false },
    referralCode: { type: String, unique: true },
    referredBy: { type: String, default: null },
    referralEarnings: { type: Number, default: 0 },
    referralCount: { type: Number, default: 0 },
    rank: { type: String, default: 'TRAINEE' },
    botPlan: { type: String, default: 'None' },
    bep20Address: { type: String },
    trc20Address: { type: String },
    withdrawalCode: { type: String },
    withdrawalCodeExpiry: { type: Date },
    transactions: [{
        type: String,
        amount: Number,
        txid: String,
        status: { type: String, default: 'pending' },
        createdAt: { type: Date, default: Date.now }
    }],
    pendingDeposits: [{
        txid: String,
        amount: Number,
        status: { type: String, default: 'pending' },
        createdAt: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// ==================== ANNOUNCEMENT SCHEMA ====================
const announcementSchema = new mongoose.Schema({
    title: { type: String, required: true },
    message: { type: String, required: true },
    image: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});
const Announcement = mongoose.model('Announcement', announcementSchema);

// ==================== EMAIL ====================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function sendEmail(to, subject, text) {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: to,
            subject: subject,
            html: `<div style="padding:20px; background:#05070a; color:#FFD700;"><h2>${subject}</h2><p>${text}</p></div>`
        });
    } catch (err) {
        console.log('Email error:', err.message);
    }
}

// ==================== TELEGRAM ====================
async function sendTelegramAlert(text) {
    try {
        await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: text,
            parse_mode: 'Markdown'
        });
    } catch (err) {
        console.log('Telegram error:', err.message);
    }
}

// ==================== GENERATE WALLETS ====================
async function generateWallets() {
    const bep20 = bsc.eth.accounts.create();
    const trc20 = await tronWeb.createAccount();
    return {
        bep20: { address: bep20.address, privateKey: bep20.privateKey },
        trc20: { address: trc20.address.base58, privateKey: trc20.privateKey }
    };
}

// ==================== BINANCE AUTO-FORWARD ====================
const BINANCE_API_KEY = process.env.BINANCE_API_KEY_FORWARD;
const BINANCE_SECRET_KEY = process.env.BINANCE_SECRET_KEY_FORWARD;
const CENTRAL_BEP20_ADDRESS = "0x9cecaca8d1e50788c7842e1f39af1ac56821d62d";
const CENTRAL_TRC20_ADDRESS = "TK6rVADXttcYhbzgyd1bRUmHCcwkrfm6m9";

function buildSign(queryString, secret) {
    return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

async function forwardToBinance(amount, network = 'BSC') {
    try {
        const timestamp = Date.now();
        const address = network === 'BSC' ? CENTRAL_BEP20_ADDRESS : CENTRAL_TRC20_ADDRESS;
        const params = { coin: 'USDT', address: address, amount: amount, network: network, timestamp: timestamp, recvWindow: 5000 };
        const queryString = new URLSearchParams(params).toString();
        const signature = buildSign(queryString, BINANCE_SECRET_KEY);
        
        const response = await axios({
            method: 'POST',
            url: 'https://api.binance.com/sapi/v1/capital/withdraw/apply',
            headers: { 'X-MBX-APIKEY': BINANCE_API_KEY, 'Content-Type': 'application/json' },
            data: { ...params, signature }
        });
        console.log(`✅ Auto-forwarded $${amount} to ${network} wallet. ID: ${response.data.id}`);
        return response.data.id;
    } catch (error) {
        console.error('Auto-forward failed:', error.response?.data || error.message);
        return null;
    }
}

// ==================== DEPOSIT MONITORING ====================
async function monitorBEP20Deposits() {
    try {
        const users = await User.find({});
        for (const user of users) {
            if (!user.bep20Address) continue;
            const url = `https://api.bscscan.com/api?module=account&action=txlist&address=${user.bep20Address}&apikey=${process.env.BSCSCAN_API_KEY || 'YOUR_API_KEY'}`;
            const res = await axios.get(url);
            const txs = res.data.result || [];
            for (const tx of txs) {
                const exists = user.transactions.find(t => t.txid === tx.hash);
                if (tx.value > 0 && !exists) {
                    const amount = Number(tx.value) / 1e18;
                    if (amount > 0) {
                        user.balance += amount;
                        user.totalDeposit += amount;
                        user.transactions.push({ type: 'deposit', amount: amount, txid: tx.hash, status: 'completed' });
                        await user.save();
                        await sendEmail(user.email, "✅ Deposit Confirmed!", `Your deposit of $${amount} has been confirmed. TXID: ${tx.hash}`);
                        await sendTelegramAlert(`💰 Deposit: $${amount} from ${user.email}\nTXID: ${tx.hash}`);
                        if (BINANCE_API_KEY) await forwardToBinance(amount, 'BSC');
                    }
                }
            }
        }
    } catch (err) { console.error('BEP20 monitor error:', err.message); }
}

async function monitorTRC20Deposits() {
    try {
        const users = await User.find({});
        for (const user of users) {
            if (!user.trc20Address) continue;
            const url = `https://apilist.tronscan.org/api/transaction?address=${user.trc20Address}&limit=50`;
            const res = await axios.get(url);
            const txs = res.data.data || [];
            for (const tx of txs) {
                const exists = user.transactions.find(t => t.txid === tx.hash);
                if (tx.contractData && tx.contractData.amount && !exists) {
                    const amount = Number(tx.contractData.amount) / 1e6;
                    if (amount > 0) {
                        user.balance += amount;
                        user.totalDeposit += amount;
                        user.transactions.push({ type: 'deposit', amount: amount, txid: tx.hash, status: 'completed' });
                        await user.save();
                        await sendEmail(user.email, "✅ Deposit Confirmed!", `Your deposit of $${amount} has been confirmed. TXID: ${tx.hash}`);
                        await sendTelegramAlert(`💰 Deposit: $${amount} from ${user.email}\nTXID: ${tx.hash}`);
                        if (BINANCE_API_KEY) await forwardToBinance(amount, 'TRX');
                    }
                }
            }
        }
    } catch (err) { console.error('TRC20 monitor error:', err.message); }
}

// ==================== 2FA ====================
function generate2FASecret() {
    return speakeasy.generateSecret({ length: 20 });
}
function verify2FAToken(secret, token) {
    return speakeasy.totp.verify({ secret: secret, encoding: 'base32', token: token });
}

// ==================== REFERRAL CODE ====================
function generateReferralCode(userId) {
    return 'HAKIM' + userId.slice(-6) + Math.random().toString(36).substring(2, 6).toUpperCase();
}

// ==================== REGISTER ====================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, referralCode } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ success: false, message: "Email already exists" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = 'HK' + Math.floor(1000 + Math.random() * 9000);
        const userReferralCode = generateReferralCode(userId);
        const wallets = await generateWallets();

        let referredByUser = null;
        if (referralCode) {
            referredByUser = await User.findOne({ referralCode });
            if (referredByUser) {
                referredByUser.referralCount += 1;
                await referredByUser.save();
            }
        }

        const newUser = new User({
            name, email, password: hashedPassword, userId,
            bep20Address: wallets.bep20.address, trc20Address: wallets.trc20.address,
            referralCode: userReferralCode, referredBy: referredByUser ? referredByUser.userId : null
        });
        await newUser.save();

        await sendEmail(email, "Welcome to Hakim AI!", `Welcome ${name}! Your User ID: ${userId}\nBEP20: ${wallets.bep20.address}\nTRC20: ${wallets.trc20.address}`);
        await sendTelegramAlert(`🆕 New user: ${name} (${email})`);

        res.status(201).json({ success: true, message: "Account created!", userId, bep20Address: wallets.bep20.address, trc20Address: wallets.trc20.address, referralCode: userReferralCode });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==================== LOGIN ====================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ success: false, message: "User not found" });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ success: false, message: "Invalid password" });

        res.json({
            success: true,
            user: {
                _id: user._id, name: user.name, email: user.email, balance: user.balance,
                userId: user.userId, bep20Address: user.bep20Address, trc20Address: user.trc20Address,
                rank: user.rank, referralCode: user.referralCode, referralCount: user.referralCount,
                referralEarnings: user.referralEarnings, twoFactorEnabled: user.twoFactorEnabled
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==================== GET USER ====================
app.get('/api/user/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        res.json({ success: true, user: { _id: user._id, name: user.name, email: user.email, balance: user.balance, userId: user.userId, rank: user.rank, botPlan: user.botPlan } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== GET REFERRAL INFO ====================
app.get('/api/referral/:userId', async (req, res) => {
    try {
        const user = await User.findOne({ userId: req.params.userId });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        const referrals = await User.find({ referredBy: user.userId });
        res.json({
            success: true, referralCode: user.referralCode,
            referralLink: `https://hakim-arbitrage-v8.vercel.app?ref=${user.referralCode}`,
            referralCount: referrals.length, referralEarnings: user.referralEarnings,
            referrals: referrals.map(r => ({ name: r.name, email: r.email, joined: r.createdAt }))
        });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== GET TRANSACTION HISTORY ====================
app.get('/api/history/:userId', async (req, res) => {
    try {
        const user = await User.findOne({ userId: req.params.userId });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        res.json({ transactions: user.transactions || [], balance: user.balance });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== RENT BOT ====================
app.post('/api/rent-bot', async (req, res) => {
    try {
        const { userId, botName, botPrice } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        if (user.balance < botPrice) return res.status(400).json({ success: false, message: "Insufficient balance" });
        user.balance -= botPrice;
        user.botPlan = botName;
        user.transactions.push({ type: 'bot_rent', amount: botPrice, txid: botName, status: 'completed' });
        await user.save();
        if (user.referredBy) {
            const referrer = await User.findOne({ userId: user.referredBy });
            if (referrer) {
                const commission = botPrice * 0.10;
                referrer.balance += commission;
                referrer.referralEarnings += commission;
                await referrer.save();
                await sendTelegramAlert(`💰 Referral commission: $${commission} to ${referrer.email}`);
            }
        }
        res.json({ success: true, newBalance: user.balance, botPlan: user.botPlan });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== WITHDRAWAL ====================
app.post('/api/withdraw/request', async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await User.findOne({ userId });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        const code = Math.floor(100000 + Math.random() * 900000);
        user.withdrawalCode = code.toString();
        user.withdrawalCodeExpiry = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();
        await sendEmail(user.email, "Withdrawal Verification Code", `Your code is: ${code}\nExpires in 10 minutes.`);
        res.json({ success: true, message: "Verification code sent to your email" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/withdraw/confirm', async (req, res) => {
    try {
        const { userId, amount, address, emailCode, twoFACode } = req.body;
        const user = await User.findOne({ userId });
        if (!user) return res.status(404).json({ error: "User not found" });
        if (amount < 10) return res.json({ error: "Minimum withdrawal is $10" });
        if (user.balance < amount) return res.json({ error: "Insufficient balance" });
        if (user.withdrawalCode !== emailCode || user.withdrawalCodeExpiry < new Date()) {
            return res.json({ error: "Invalid or expired verification code" });
        }
        if (user.twoFactorEnabled) {
            const valid2FA = verify2FAToken(user.twoFactorSecret, twoFACode);
            if (!valid2FA) return res.json({ error: "Invalid Google Authenticator code" });
        }
        user.balance -= amount;
        user.transactions.push({ type: 'withdraw', amount: amount, txid: address, status: 'pending' });
        user.withdrawalCode = null;
        user.withdrawalCodeExpiry = null;
        await user.save();
        await sendEmail(user.email, "Withdrawal Request Submitted", `$${amount} to ${address}`);
        await sendTelegramAlert(`📤 Withdrawal: $${amount} from ${user.email} to ${address}`);
        res.json({ success: true, message: "Withdrawal request submitted for admin approval" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== ADMIN ====================
app.post('/api/admin/announcement', async (req, res) => {
    try {
        const { title, message, image } = req.body;
        const newAnnouncement = new Announcement({ title, message, image });
        await newAnnouncement.save();
        await sendTelegramAlert(`📢 New Announcement: ${title}\n${message}`);
        res.json({ success: true, announcement: newAnnouncement });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/announcements', async (req, res) => {
    try {
        const announcements = await Announcement.find().sort({ createdAt: -1 });
        res.json({ success: true, announcements });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find({}).sort({ createdAt: -1 });
        res.json({ users, totalUsers: users.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== CHAT ====================
app.post('/api/chat/send', async (req, res) => {
    try {
        const { name, email, message } = req.body;
        await sendTelegramAlert(`💬 New Message from ${name} (${email}): ${message}`);
        res.json({ success: true, message: "Message sent to support" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => { res.json({ status: 'OK', timestamp: new Date().toISOString() }); });

// ==================== START MONITORING ====================
setInterval(() => { monitorBEP20Deposits(); monitorTRC20Deposits(); }, 60 * 1000);
console.log('✅ Deposit monitoring started (every 1 minute)');

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`✅ MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
});
