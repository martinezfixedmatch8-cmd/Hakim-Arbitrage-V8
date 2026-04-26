import { useEffect, useState } from "react";
import axios from "axios";

const API = "https://hakim-arbitrage-v8.up.railway.app";

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [view, setView] = useState("home");
  const [users, setUsers] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [otpSent, setOtpSent] = useState(false);

  useEffect(() => {
    if (token) loadUser();
    loadLeaderboard();
  }, [token]);

  async function loadUser() {
    const res = await axios.get(API + "/user", { headers: { Authorization: `Bearer ${token}` } });
    setUser(res.data);
    loadReferrals(res.data._id);
  }

  async function loadLeaderboard() {
    const res = await axios.get(API + "/leaderboard");
    setLeaderboard(res.data);
  }

  async function loadReferrals(userId) {
    const res = await axios.get(API + `/referral/${userId}`);
    setReferrals(res.data.referrals || []);
  }

  async function handleRegister(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    const res = await axios.post(API + "/register", {
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
      ref: form.get("ref")
    });
    if (res.data.success) alert("Registered! Please login.");
  }

  async function handleLogin(e) {
    e.preventDefault();
    const res = await axios.post(API + "/login", {
      email: e.target.email.value,
      password: e.target.password.value
    });
    if (res.data.token) {
      localStorage.setItem("token", res.data.token);
      setToken(res.data.token);
      setUser(res.data.user);
    } else alert("Login failed");
  }

  async function rentBot(botName, botPrice) {
    const res = await axios.post(API + "/rent-bot", { botName, botPrice }, { headers: { Authorization: `Bearer ${token}` } });
    alert(res.data.success ? "Bot activated!" : res.data.error);
    loadUser();
  }

  async function requestWithdrawOTP() {
    await axios.post(API + "/withdraw/otp", {}, { headers: { Authorization: `Bearer ${token}` } });
    setOtpSent(true);
    alert("OTP sent to your email!");
  }

  async function confirmWithdraw(e) {
    e.preventDefault();
    const res = await axios.post(API + "/withdraw/confirm", {
      amount: parseFloat(e.target.amount.value),
      address: e.target.address.value,
      otp: e.target.otp.value,
      twoFACode: e.target.twoFACode.value
    }, { headers: { Authorization: `Bearer ${token}` } });
    alert(res.data.message || res.data.error);
    if (res.data.success) loadUser();
  }

  async function setup2FA() {
    const res = await axios.get(API + "/2fa/setup", { headers: { Authorization: `Bearer ${token}` } });
    const qrWindow = window.open();
    qrWindow.document.write(`<img src="${res.data.qr}" /><p>Secret: ${res.data.secret}</p><p>Enter code in Google Authenticator</p>`);
  }

  async function verify2FA(code) {
    const res = await axios.post(API + "/2fa/verify", { code }, { headers: { Authorization: `Bearer ${token}` } });
    alert(res.data.success ? "2FA Enabled!" : "Invalid code");
    loadUser();
  }

  if (!token) {
    return (
      <div style={{ background: "#05070a", color: "#f3ba2f", minHeight: "100vh", fontFamily: "Poppins" }}>
        <div style={{ maxWidth: 500, margin: "auto", padding: 40 }}>
          <h1 style={{ color: "#f3ba2f", textAlign: "center" }}>🚀 Hakim AI</h1>
          <form onSubmit={handleRegister} style={{ background: "#1a1f2c", padding: 25, borderRadius: 20, marginBottom: 20 }}>
            <h2>Register</h2>
            <input name="name" placeholder="Name" required style={{ width: "100%", padding: 10, margin: "10px 0", background: "#0a0c10", color: "white", border: "1px solid #f3ba2f", borderRadius: 8 }} />
            <input name="email" type="email" placeholder="Email" required style={{ width: "100%", padding: 10, margin: "10px 0", background: "#0a0c10", color: "white", border: "1px solid #f3ba2f", borderRadius: 8 }} />
            <input name="password" type="password" placeholder="Password" required style={{ width: "100%", padding: 10, margin: "10px 0", background: "#0a0c10", color: "white", border: "1px solid #f3ba2f", borderRadius: 8 }} />
            <input name="ref" placeholder="Referral Code (optional)" style={{ width: "100%", padding: 10, margin: "10px 0", background: "#0a0c10", color: "white", border: "1px solid #f3ba2f", borderRadius: 8 }} />
            <button type="submit" style={{ background: "#f3ba2f", color: "black", padding: 12, borderRadius: 8, width: "100%", fontWeight: "bold" }}>Register</button>
          </form>

          <form onSubmit={handleLogin} style={{ background: "#1a1f2c", padding: 25, borderRadius: 20 }}>
            <h2>Login</h2>
            <input name="email" type="email" placeholder="Email" required style={{ width: "100%", padding: 10, margin: "10px 0", background: "#0a0c10", color: "white", border: "1px solid #f3ba2f", borderRadius: 8 }} />
            <input name="password" type="password" placeholder="Password" required style={{ width: "100%", padding: 10, margin: "10px 0", background: "#0a0c10", color: "white", border: "1px solid #f3ba2f", borderRadius: 8 }} />
            <button type="submit" style={{ background: "#f3ba2f", color: "black", padding: 12, borderRadius: 8, width: "100%", fontWeight: "bold" }}>Login</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#05070a", color: "white", fontFamily: "Poppins", minHeight: "100vh" }}>
      <nav style={{ background: "#111", padding: "15px 20px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ color: "#f3ba2f" }}>Hakim AI</h2>
        <div style={{ display: "flex", gap: 15 }}>
          <button onClick={() => setView("home")} style={{ background: "none", color: "#f3ba2f" }}>Home</button>
          <button onClick={() => setView("dashboard")} style={{ background: "none", color: "#f3ba2f" }}>Dashboard</button>
          <button onClick={() => setView("bots")} style={{ background: "none", color: "#f3ba2f" }}>Bots</button>
          <button onClick={() => setView("leaderboard")} style={{ background: "none", color: "#f3ba2f" }}>Leaderboard</button>
          <button onClick={() => setView("referral")} style={{ background: "none", color: "#f3ba2f" }}>Referral</button>
          <button onClick={() => { localStorage.clear(); setToken(null); setUser(null); }} style={{ background: "none", color: "red" }}>Logout</button>
        </div>
      </nav>

      <div style={{ maxWidth: 1200, margin: "auto", padding: 30 }}>
        {view === "home" && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <h1 style={{ fontSize: 48, color: "#f3ba2f" }}>🤖 AI Arbitrage Trading</h1>
            <p style={{ color: "#8a92a3" }}>Automated trading bot • 0.5-3% daily profit • 24/7</p>
            <button onClick={() => setView("dashboard")} style={{ background: "#f3ba2f", color: "black", padding: "12px 30px", borderRadius: 30, fontSize: 18, marginTop: 20 }}>Get Started</button>
            <div style={{ marginTop: 40, background: "#1a1f2c", padding: 20, borderRadius: 20 }}>
              <h3>📈 Live BTC Price</h3>
              <iframe src="https://s.tradingview.com/widgetembed/?symbol=BINANCE:BTCUSDT&interval=1" width="100%" height="300" style={{ border: "none", borderRadius: 12 }}></iframe>
            </div>
          </div>
        )}

        {view === "dashboard" && user && (
          <div>
            <div style={{ background: "linear-gradient(135deg,#1a1f2c,#0f121a)", borderRadius: 28, padding: 30, textAlign: "center", marginBottom: 30 }}>
              <h2>Welcome, {user.name}</h2>
              <div style={{ fontSize: 48, fontWeight: "bold", color: "#f3ba2f" }}>${user.balance?.toFixed(2)}</div>
              <p>Rank: <strong>{user.rank}</strong> | Bot: {user.botPlan}</p>
            </div>

            <div style={{ background: "#1a1f2c", borderRadius: 20, padding: 25, marginBottom: 20 }}>
              <h3>📥 Your Deposit Addresses</h3>
              <p><strong>BEP20:</strong> {user.walletBEP20}</p>
              <p><strong>TRC20:</strong> {user.walletTRC20}</p>
              <p style={{ color: "#f6465d", fontSize: 12 }}>⚠️ Send only USDT to these addresses</p>
            </div>

            <div style={{ background: "#1a1f2c", borderRadius: 20, padding: 25, marginBottom: 20 }}>
              <h3>📤 Withdraw Funds</h3>
              {!otpSent && <button onClick={requestWithdrawOTP} style={{ background: "#f3ba2f", color: "black", padding: 12, borderRadius: 10, width: "100%" }}>Send OTP to Email</button>}
              {otpSent && (
                <form onSubmit={confirmWithdraw}>
                  <input name="amount" type="number" placeholder="Amount (USDT)" required style={{ width: "100%", padding: 10, margin: "10px 0", background: "#0a0c10", color: "white", border: "1px solid #f3ba2f", borderRadius: 8 }} />
                  <input name="address" placeholder="BEP20/TRC20 Address" required style={{ width: "100%", padding: 10, margin: "10px 0", background: "#0a0c10", color: "white", border: "1px solid #f3ba2f", borderRadius: 8 }} />
                  <input name="otp" placeholder="OTP Code" required style={{ width: "100%", padding: 10, margin: "10px 0", background: "#0a0c10", color: "white", border: "1px solid #f3ba2f", borderRadius: 8 }} />
                  <input name="twoFACode" placeholder="2FA Code (if enabled)" style={{ width: "100%", padding: 10, margin: "10px 0", background: "#0a0c10", color: "white", border: "1px solid #f3ba2f", borderRadius: 8 }} />
                  <button type="submit" style={{ background: "#f3ba2f", color: "black", padding: 12, borderRadius: 8, width: "100%", fontWeight: "bold" }}>Confirm Withdrawal</button>
                </form>
              )}
            </div>

            <div style={{ background: "#1a1f2c", borderRadius: 20, padding: 25 }}>
              <h3>🔐 Security</h3>
              {!user.twoFAEnabled ? (
                <>
                  <button onClick={setup2FA} style={{ background: "#f3ba2f", color: "black", padding: 10, borderRadius: 8, marginRight: 10 }}>Setup 2FA</button>
                  <input id="2faCode" placeholder="Enter 2FA code" style={{ padding: 10, background: "#0a0c10", color: "white", border: "1px solid #f3ba2f", borderRadius: 8 }} />
                  <button onClick={() => verify2FA(document.getElementById("2faCode").value)} style={{ background: "#f3ba2f", color: "black", padding: 10, borderRadius: 8 }}>Verify 2FA</button>
                </>
              ) : <p style={{ color: "#0ecb81" }}>✅ 2FA Enabled</p>}
            </div>
          </div>
        )}

        {view === "bots" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 20 }}>
            {[{ name: "Nano Bot", price: 49.99 }, { name: "Alpha Bot", price: 99.99 }, { name: "Pro Bot", price: 199.99 }, { name: "Elite Bot", price: 399.99 }, { name: "Legend Bot", price: 599.99 }].map(bot => (
              <div key={bot.name} style={{ background: "#1a1f2c", borderRadius: 20, padding: 25, textAlign: "center" }}>
                <h3>{bot.name}</h3>
                <p style={{ fontSize: 28, fontWeight: "bold", color: "#f3ba2f" }}>${bot.price}</p>
                <button onClick={() => rentBot(bot.name, bot.price)} style={{ background: "#f3ba2f", color: "black", padding: 10, borderRadius: 8, width: "100%" }}>Rent Bot</button>
              </div>
            ))}
          </div>
        )}

        {view === "leaderboard" && (
          <div>
            <h2 style={{ color: "#f3ba2f" }}>🏆 Leaderboard</h2>
            {leaderboard.map((u, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", background: "#1a1f2c", padding: 15, borderRadius: 12, marginBottom: 10 }}>
                <span>#{i + 1} {u.name}</span>
                <span>💰 ${u.balance?.toFixed(2)}</span>
                <span>👥 {u.referrals} refs</span>
                <span>🏅 {u.rank}</span>
              </div>
            ))}
          </div>
        )}

        {view === "referral" && (
          <div>
            <div style={{ background: "#1a1f2c", borderRadius: 20, padding: 25, textAlign: "center", marginBottom: 20 }}>
              <h3>Your Referral Code</h3>
              <p style={{ fontSize: 24, color: "#f3ba2f" }}>{user.referralCode}</p>
              <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}?ref=${user.referralCode}`)} style={{ background: "#f3ba2f", color: "black", padding: 10, borderRadius: 8 }}>Copy Link</button>
              <p>Total Referrals: {referrals.length}</p>
              <p>Earnings: ${user.referralEarnings?.toFixed(2)}</p>
            </div>
            {referrals.length > 0 && (
              <div style={{ background: "#1a1f2c", borderRadius: 20, padding: 25 }}>
                <h3>Your Referrals</h3>
                {referrals.map((r, i) => <p key={i}>{r.name} - {r.email}</p>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
