# 🚀 PR Security Bot

## 🔒 Secure Your Repository from Malicious PRs

**PR Security Bot** is a GitHub App(bot) that **automatically scans pull requests**, identifies malicious code, and prevents security threats before they get merged. The bot provides **inline PR comments**, assigns a **security score**, and **auto-closes PRs** that fall below a threshold, ensuring your repository remains safe from supply chain attacks.

![Security Scan](/public/Install.jpg)

---

## ✨ Features

✅ **AI-Powered Threat Detection** – Scans PRs for potential vulnerabilities and malicious code.

✅ **Security Score Assessment** – Assigns a security score to every PR to help maintainers make informed decisions.

✅ **Automated PR Actions** – Auto-closes PRs with a security score below **40**, preventing risky merges.

✅ **Inline PR Comments** – Highlights security risks directly in the code for easy review.

✅ **Comprehensive Security Checks:**
   - 🔐 **Sensitive Data Exposure** – Detects hardcoded credentials, API keys, and other sensitive data.
   - 💉 **SQL Injection** – Flags potential SQL injection vulnerabilities.
   - 🛠 **Command Injection** – Identifies risks related to command execution attacks.
   - ⚙️ **Insecure Configurations** – Detects weak security configurations in the code.
   - 🛡 **XSS Vulnerabilities** – Scans for cross-site scripting attacks.
   - 🏴 **Unsafe Deserialization** – Prevents object deserialization attacks.
   - 📦 **Malicious Packages** – Identifies unsafe dependencies in package files.
   - ⛏ **Crypto Mining Scripts** – Detects unauthorized crypto mining operations.
   - 📤 **Data Exfiltration** – Alerts on suspicious data exfiltration attempts.
   - 🔍 **Obfuscated Code** – Highlights hidden or suspiciously encoded code.
   - 🌐 **Suspicious URLs** – Warns about links leading to phishing or malicious sites.
   - 🌍 **Hardcoded IPs** – Flags static IP addresses that may pose security risks.
   - 🐞 **Debug Code** – Detects leftover debugging or testing code that could be exploited.

![Feature Overview](/public/Detail.jpg)

---

## 📦 Installation

1. **Install the GitHub App** – [Click here to install](https://github.com/apps/pryrag)
2. **Grant Repository Access** – Allow the bot to scan PRs and provide security feedback.
3. **Configure Settings** – Set up thresholds and customize bot behavior.
4. **Monitor PRs in Real-Time** – The bot will start analyzing incoming PRs automatically!

---

## 🚀 How It Works

1. **A new pull request is created** 📌
2. **The bot scans the PR for security threats** 🔍
3. **A security score is assigned (0-100)** 📊
4. **Inline comments highlight potential risks** ⚠️
5. **PR is auto-closed if the score < 40** ❌
6. **Safe PRs remain open for review** ✅

---

## 🛠️ Built With

- Probot – Framework for building GitHub Apps
- Node.js – JavaScript runtime
- AI/ML-based threat detection

---

## 📌 Get Started

```bash
git clone https://github.com/Geethika-Kancharla/PRotect.git
cd your-repo
npm install
npm start
```

---
