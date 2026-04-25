require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const app = express();

// ===== CORS FIX =====
app.use(cors({
    origin: '*',
    credentials: true
}));

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

// ===== NEW USER SCHEMA =====
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    userId: { type: String, unique: true },
    balance: { type: Number, default: 0 },
    depositAddress: { type: String, unique: true },
    totalDeposit: { type: Number, default: 0 },
    botPlan: { type: String, default: null },
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

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ===== NEW REGISTER API =====
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Email already exists!' });
        }
        
        const hashedPass = await bcrypt.hash(password, 10);
        const userId = 'HK' + Math.floor(1000 + Math.random() * 9000);
        const depositAddress = '0x' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 8);
        
        const newUser = new User({
            name,
            email,
            password: hashedPass,
            userId,
            depositAddress,
            balance: 0
        });
        
        await newUser.save();
        
        // Send Welcome Email
        try {
            await transporter.sendMail({
                from: 'pannyshp@gmail.com',
                to: email,
                subject: 'Welcome to HAKIM AI! 🚀',
                html: `
                    <div style="background:#020617; color:#f3ba2f; padding:30px;">
                        <h2>Welcome ${name}!</h2>
                        <p>Your account has been created successfully.</p>
                        <p><b>User ID:</b> ${userId}</p>
                        <p><b>Deposit Address (USDT BEP20):</b><br/>${depositAddress}</p>
                    </div>
                `
            });
        } catch(emailErr) {
            console.log('Email error:', emailErr.message);
        }
        
        res.status(201).json({ 
            message: 'Account created successfully!', 
            user: { name, email, userId, depositAddress, balance: 0 }
        });
        
    } catch(err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
});

// ===== NEW LOGIN API =====
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(400).json({ message: 'Email not found!' });
        }
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(400).json({ message: 'Wrong password!' });
        }
        
        res.json({ 
            message: 'Login successful', 
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                balance: user.balance,
                userId: user.userId,
                depositAddress: user.depositAddress,
                botPlan: user.botPlan
            }
        });
        
    } catch(err) {
        res.status(500).json({ message: err.message });
    }
});

// ===== NEW DEPOSIT API (With pending approval) =====
app.post('/api/user/deposit', async (req, res) => {
    try {
        const { userId, txid } = req.body;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        // Add to pending deposits
        user.pendingDeposits.push({
            txid: txid,
            amount: 0,
            status: 'pending'
        });
        
        await user.save();
        
        // Notify admin
        await transporter.sendMail({
            from: 'pannyshp@gmail.com',
            to: 'pannyshp@gmail.com',
            subject: 'New Deposit Request!',
            html: `<p>User: ${user.name} (${user.email})</p><p>TXID: ${txid}</p><p>Status: Pending</p>`
        });
        
        res.json({ message: 'Deposit submitted for approval!' });
        
    } catch(err) {
        res.status(500).json({ message: err.message });
    }
});

// ===== GET USER BY ID =====
app.get('/api/user/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        res.json({
            name: user.name,
            balance: user.balance,
            userId: user.userId,
            depositAddress: user.depositAddress,
            botPlan: user.botPlan
        });
    } catch(err) {
        res.status(500).json({ message: err.message });
    }
});

// ===== RENT BOT API =====
app.post('/api/user/rent-bot', async (req, res) => {
    try {
        const { userId, botName, botPrice } = req.body;
        const user = await User.findById(userId);
        
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.balance < botPrice) return res.status(400).json({ message: 'Insufficient balance!' });
        
        user.balance -= botPrice;
        user.botPlan = botName;
        await user.save();
        
        res.json({ success: true, newBalance: user.balance, botPlan: user.botPlan });
        
    } catch(err) {
        res.status(500).json({ message: err.message });
    }
});

// ===== ADMIN APPROVE DEPOSIT =====
app.post('/api/admin/approve-deposit', async (req, res) => {
    try {
        const { userId, depositId, amount } = req.body;
        const user = await User.findById(userId);
        
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        const deposit = user.pendingDeposits.id(depositId);
        if (deposit) {
            deposit.status = 'approved';
            deposit.amount = amount;
            user.balance += amount;
            user.totalDeposit += amount;
            await user.save();
            
            // Send confirmation email
            await transporter.sendMail({
                from: 'pannyshp@gmail.com',
                to: user.email,
                subject: 'Deposit Approved! ✅',
                html: `<p>Your deposit of $${amount} has been approved! New balance: $${user.balance}</p>`
            });
        }
        
        res.json({ message: 'Deposit approved!', newBalance: user.balance });
        
    } catch(err) {
        res.status(500).json({ message: err.message });
    }
});

// ===== ADMIN GET ALL USERS =====
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find({}).sort({ createdAt: -1 });
        res.json({ users, totalUsers: users.length });
    } catch(err) {
        res.status(500).json({ message: err.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`✅ MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
});
