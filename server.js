require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();

// ===== CORS FIX =====
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 8080;

// MongoDB Connection
const MONGO_URL = process.env.MONGO_URL || 'mongodb+srv://martinezfixedmatch8_db_user:EbNDP8POkgzD3Xkt@cluster0.4u7moqi.mongodb.net/HakimArbitrageDB?retryWrites=true&w=majority';

mongoose.connect(MONGO_URL)
    .then(() => console.log('✅ MongoDB Connected!'))
    .catch(err => console.log('❌ MongoDB Error:', err.message));

// ===== USER SCHEMA (Updated for New UI) =====
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    userId: { type: String, unique: true },
    balance: { type: Number, default: 0 },
    totalDeposit: { type: Number, default: 0 },
    referrals: { type: Number, default: 0 },
    rank: { type: String, default: 'TRAINEE' },
    botPlan: { type: String, default: 'None' },
    depositAddress: { type: String },
    pendingDeposits: [{
        txid: String,
        amount: Number,
        status: { type: String, default: 'pending' },
        createdAt: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Email Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'pannyshp@gmail.com',
        pass: process.env.EMAIL_PASS || 'wtay fxnq xxbs ofar'
    }
});

// ===== APIs =====

// 1. REGISTER
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, referralCode } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: 'Email already exists!' });

        const hashedPass = await bcrypt.hash(password, 10);
        const userId = 'HK-' + Math.floor(1000 + Math.random() * 9000);
        const depositAddress = '0x' + Math.random().toString(36).substring(2, 15);

        const newUser = new User({
            name, email, password: hashedPass, userId, depositAddress,
            rank: 'TRAINEE', balance: 0
        });

        // Haddii uu jiro qof soo xiriiriyay (Referral)
        if (referralCode) {
            await User.findOneAndUpdate({ userId: referralCode }, { $inc: { referrals: 1 } });
        }

        await newUser.save();
        res.status(201).json({ message: 'Account Created!' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// 2. LOGIN
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'User not found!' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Wrong password!' });

        res.json({ user });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// 3. DEPOSIT
app.post('/api/user/deposit', async (req, res) => {
    try {
        const { userId, txid, amount } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.pendingDeposits.push({ txid, amount, status: 'pending' });
        await user.save();

        // Email u dir Admin-ka
        await transporter.sendMail({
            from: 'HAKIM AI System',
            to: 'pannyshp@gmail.com',
            subject: 'New Deposit Request!',
            html: `User: ${user.name}<br>Amount: $${amount}<br>TXID: ${txid}`
        });

        res.json({ message: 'Deposit submitted!' });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// 4. RENT BOT
app.post('/api/user/rent-bot', async (req, res) => {
    try {
        const { userId, botName, botPrice } = req.body;
        const user = await User.findById(userId);
        if (user.balance < botPrice) return res.status(400).json({ message: 'Insufficient balance' });

        user.balance -= botPrice;
        user.botPlan = botName;
        await user.save();

        res.json({ success: true, newBalance: user.balance, botPlan: botName });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
