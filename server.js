const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// ===== 1. DATABASE =====
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('MongoDB connected ✅'));

// ===== 2. USER SCHEMA =====
const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    userId: String,
    balance: { type: Number, default: 0 },
    depositAddress: String,
    totalDeposit: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// ===== 3. EMAIL SETUP =====
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ===== 4. REGISTER API =====
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const hashedPass = await bcrypt.hash(password, 10);
        const userId = 'HK-' + Math.floor(1000 + Math.random() * 9000);
        const depositAddress = '0x' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 8);
        
        const newUser = new User({
            name, email, password: hashedPass, userId, depositAddress
        });
        await newUser.save();
        
        // Send Welcome Email
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Ku soo dhawaaw HakimArbitrage!',
            html: `<h2>Asc ${name}</h2><p>Akawnkaaga waa la sameeyay. ID: <b>${userId}</b></p><p>Deposit Address-kaaga: <b>${depositAddress}</b></p>`
        });
        
        res.json({ success: true, userId, depositAddress });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== 5. LOGIN API =====
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if(!user) return res.status(400).json({ error: 'User not found' });
    
    const valid = await bcrypt.compare(password, user.password);
    if(!valid) return res.status(400).json({ error: 'Wrong password' });
    
    res.json({ success: true, user: { name: user.name, balance: user.balance, userId: user.userId, depositAddress: user.depositAddress } });
});

// ===== 6. ADMIN: GET ALL USERS =====
app.get('/api/admin/users', async (req, res) => {
    const users = await User.find({}).sort({ createdAt: -1 });
    const totalBalance = users.reduce((sum, u) => sum + u.balance, 0);
    res.json({ users, totalUsers: users.length, totalBalance });
});

// ===== 7. DEPOSIT WEBHOOK (Auto-update balance) =====
app.post('/api/deposit/confirm', async (req, res) => {
    const { address, amount, txHash } = req.body;
    const user = await User.findOne({ depositAddress: address });
    if(user) {
        user.balance += amount;
        user.totalDeposit += amount;
        await user.save();
        
        // Email ku dir macmiilka
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'Deposit Confirmed!',
            html: `<p>Lacag dhan $${amount} ayaa ku soo dhacday account-kaaga. Balance cusub: $${user.balance}</p>`
        });
        
        // Email ku dir Admin-ka (adiga)
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.ADMIN_EMAIL,
            subject: '💰 Lacag cusub ayaa timid!',
            html: `<p>Macmiil ${user.name} ayaa shubtay $${amount}</p><p>Transaction: ${txHash}</p>`
        });
        
        res.json({ success: true, newBalance: user.balance });
    } else {
        res.status(404).json({ error: 'User not found for this address' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
