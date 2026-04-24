require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

// MongoDB Connection
const MONGO_URL = process.env.MONGO_URL || 'mongodb+srv://martinezfixedmatch8_db_user:EbNDP8POkgzD3Xkt@cluster0.4u7moqi.mongodb.net/HakimArbitrageDB?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGO_URL)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.log('❌ MongoDB Error:', err.message));

// User Schema
const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    userId: String,
    balance: { type: Number, default: 0 },
    depositAddress: String,
    totalDeposit: { type: Number, default: 0 },
    botPlan: { type: String, default: null },
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

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// REGISTER API
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ error: 'Email already exists' });
        
        const hashedPass = await bcrypt.hash(password, 10);
        const userId = 'HK' + Math.floor(1000 + Math.random() * 9000);
        const depositAddress = '0x' + Math.random().toString(36).substring(2, 15);
        
        const newUser = new User({ name, email, password: hashedPass, userId, depositAddress });
        await newUser.save();
        
        try {
            await transporter.sendMail({
                from: 'pannyshp@gmail.com',
                to: email,
                subject: 'Welcome to HakimArbitrage',
                html: `<h2>Welcome ${name}!</h2><p>Your ID: ${userId}</p><p>Deposit Address: ${depositAddress}</p>`
            });
        } catch(e) { console.log('Email error:', e.message); }
        
        res.json({ success: true, userId, depositAddress });
        
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// LOGIN API
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'User not found' });
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(400).json({ error: 'Wrong password' });
        
        res.json({ 
            success: true, 
            user: {
                name: user.name,
                email: user.email,
                balance: user.balance,
                userId: user.userId,
                depositAddress: user.depositAddress,
                botPlan: user.botPlan
            }
        });
        
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// RENT BOT API
app.post('/api/rent-bot', async (req, res) => {
    try {
        const { userId, botName, botPrice } = req.body;
        const user = await User.findOne({ userId });
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.balance < botPrice) return res.status(400).json({ error: 'Insufficient balance' });
        
        user.balance -= botPrice;
        user.botPlan = botName;
        await user.save();
        
        res.json({ success: true, newBalance: user.balance, botPlan: user.botPlan });
        
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// GET USER API
app.get('/api/user/:userId', async (req, res) => {
    try {
        const user = await User.findOne({ userId: req.params.userId });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        res.json({
            name: user.name,
            balance: user.balance,
            userId: user.userId,
            depositAddress: user.depositAddress,
            botPlan: user.botPlan
        });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
