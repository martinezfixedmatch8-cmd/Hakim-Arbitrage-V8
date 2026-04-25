// arbitrage-bot.js - Professional Arbitrage Trading Bot
require('dotenv').config();
const ccxt = require('ccxt');
const axios = require('axios');
const fs = require('fs');

console.log('🚀 Hakim Arbitrage Bot Started');
console.log('📊 Monitoring Binance for opportunities...');

// Simple price check
async function checkPrices() {
    try {
        const binance = new ccxt.binance();
        const ticker = await binance.fetchTicker('BTC/USDT');
        
        console.log(`[${new Date().toLocaleTimeString()}] BTC/USDT: $${ticker.last}`);
        
        // Save to log
        fs.appendFileSync('prices.log', `${new Date().toISOString()},BTC,${ticker.last}\n`);
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Check every 10 seconds
setInterval(checkPrices, 10000);

console.log('✅ Bot is running 24/7...');
