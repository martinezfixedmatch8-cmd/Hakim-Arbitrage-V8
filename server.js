require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();

// ===== CORS FIX - THIS IS THE IMPORTANT PART =====
app.use(cors({
    origin: '*',
    credentials: true
}));

// Additional CORS headers for all routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 8080;

// MongoDB Connection
const MONGO_URL = process.env.MONGO_URL || 'mongodb+srv://martinezfixedmatch8_db_user:EbNDP8POkgzD3Xkt@cluster0.4u7moqi.mongodb.net/HakimArbitrageDB?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGO_URL)
    .then(() => console.log('✅ MongoDB Connected Successfully!'))
    .catch(err => console.log('❌ MongoDB Error:', err.message));

// User Schema
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    userId: { type: String, unique: true },
    balance: { type: Number, default: 0 },
    depositAddress: { type: String, unique: true },
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
        
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already exists!' });
        }
        
        const hashedPass = await bcrypt.hash(password, 10);
        const userId = 'HK' + Math.floor(1000 + Math.random() * 9000);
        const depositAddress = '0x' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 8);
        
        const newUser = new User({
            name,
            email,
            password: hashedPass,
            userId,
            depositAddress
        });
        
        await newUser.save();
        
        // Send Welcome Email
        try {
            await transporter.sendMail({
                from: 'pannyshp@gmail.com',
                to: email,
                subject: 'Welcome to HakimArbitrage PRO! 🚀',
                html: `
                    <div style="background:#020617; color:#00ff88; padding:30px; font-family:sans-serif;">
                        <h2>Welcome ${name}!</h2>
                        <p>Your account has been created successfully.</p>
                        <p><b>User ID:</b> ${userId}</p>
                        <p><b>Deposit Address (USDT BEP20):</b><br/>${depositAddress}</p>
                        <p>Rent a bot now to start earning!</p>
                    </div>
                `
            });
            console.log('Welcome email sent to:', email);
        } catch(emailErr) {
            console.log('Email error:', emailErr.message);
        }
        
        res.json({ 
            success: true, 
            userId, 
            depositAddress,
            message: 'Account created! Check your email.'
        });
        
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// LOGIN API
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(400).json({ error: 'Email not found!' });
        }
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(400).json({ error: 'Wrong password!' });
        }
        
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

// RENT BOT API
app.post('/api/rent-bot', async (req, res) => {
    try {
        const { userId, botName, botPrice } = req.body;
        const user = await User.findOne({ userId });
        
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.balance < botPrice) return res.status(400).json({ error: 'Insufficient balance!' });
        
        user.balance -= botPrice;
        user.botPlan = botName;
        await user.save();
        
        res.json({ success: true, newBalance: user.balance, botPlan: user.botPlan });
        
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// DEPOSIT WEBHOOK
app.post('/api/deposit/confirm', async (req, res) => {
    try {
        const { address, amount, txHash } = req.body;
        const user = await User.findOne({ depositAddress: address });
        
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        user.balance += amount;
        user.totalDeposit += amount;
        await user.save();
        
        res.json({ success: true, newBalance: user.balance });
        
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// WITHDRAW API
app.post('/api/withdraw', async (req, res) => {
    try {
        const { email, amount, address } = req.body;
        const user = await User.findOne({ email });
        
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });
        
        user.balance -= amount;
        await user.save();
        
        await transporter.sendMail({
            from: 'pannyshp@gmail.com',
            to: email,
            subject: '⚠️ Withdrawal Alert',
            html: `<p>$${amount} has been withdrawn to ${address}</p>`
        });
        
        res.json({ success: true, newBalance: user.balance });
        
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ADMIN GET ALL USERS
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find({}).sort({ createdAt: -1 });
        res.json({ users, totalUsers: users.length });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`✅ MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
});