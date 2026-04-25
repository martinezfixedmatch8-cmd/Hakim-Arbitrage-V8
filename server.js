require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://martinezfixedmatch8_db_user:EbNDP8POkgzD3Xkt@cluster0.4u7moqi.mongodb.net/HakimArbitrageDB?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// User Schema
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0 },
    userId: { type: String, unique: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// ==================== API ENDPOINTS ====================

// 1. REGISTER
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Email already exists" });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = 'HK' + Math.floor(1000 + Math.random() * 9000);
        
        const newUser = new User({
            name,
            email,
            password: hashedPassword,
            userId,
            balance: 0
        });
        
        await newUser.save();
        res.status(201).json({ success: true, message: "Account created!" });
        
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. LOGIN
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(401).json({ success: false, message: "User not found" });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ success: false, message: "Invalid password" });
        }
        
        res.json({ 
            success: true, 
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                balance: user.balance,
                userId: user.userId
            }
        });
        
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. GET USER BY ID
app.get('/api/user/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        
        res.json({
            success: true,
            user: {
                _id: user._id,
                name: user.name,
                balance: user.balance,
                userId: user.userId
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. CREATE PAYMENT (NOWPayments)
app.post('/api/create-payment', async (req, res) => {
    const { amount, userId } = req.body;
    
    if (!amount || amount < 30) {
        return res.status(400).json({ success: false, error: "Minimum deposit is $30" });
    }
    
    try {
        const response = await axios.post('https://api.nowpayments.io/v1/payment', {
            price_amount: amount,
            price_currency: 'usd',
            pay_currency: 'usdtbsc',
            ipn_callback_url: 'https://hakim-arbitrage-v8.up.railway.app/api/payment-webhook',
            order_id: userId,
            order_description: "Hakim AI Deposit"
        }, {
            headers: { 
                'x-api-key': process.env.NOWPAY_API_KEY || 'WAYNKPO-16445S06-P1XCJ28-GT150GJ',
                'Content-Type': 'application/json'
            }
        });
        
        res.json({ 
            success: true, 
            payment_url: response.data.invoice_url,
            payment_id: response.data.payment_id
        });
        
    } catch (error) {
        console.error('NOWPayments error:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: "Payment creation failed" });
    }
});

// 5. PAYMENT WEBHOOK (IPN)
app.post('/api/payment-webhook', async (req, res) => {
    try {
        const secret = process.env.IPN_SECRET || '1rGl8UuCBLL50G8r2wJr79Ih11ZhviqG';
        const hmac = req.headers['x-nowpayments-sig'];
        
        const sortedData = JSON.stringify(req.body, Object.keys(req.body).sort());
        const checkHmac = crypto.createHmac('sha512', secret).update(sortedData).digest('hex');
        
        if (hmac !== checkHmac) {
            console.log('❌ Invalid signature');
            return res.status(403).send('Invalid signature');
        }
        
        const data = req.body;
        console.log('Webhook received:', data);
        
        if (data.payment_status === 'finished') {
            const userId = data.order_id;
            const amount = parseFloat(data.price_amount);
            
            const user = await User.findById(userId);
            if (user) {
                user.balance += amount;
                await user.save();
                console.log(`✅ Added $${amount} to user ${user.email}. New balance: $${user.balance}`);
            }
        }
        
        res.status(200).send('OK');
        
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).send('Error');
    }
});

// 6. HEALTH CHECK
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`✅ MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
});
