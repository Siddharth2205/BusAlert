# 🚌 BusAlert

> Never miss your bus again — BusAlert rings an alarm when your bus is one stop away.

![Live](https://img.shields.io/badge/Live-bus--alert.vercel.app-brightgreen?style=flat-square)
![Language](https://img.shields.io/badge/Language-TypeScript-blue?style=flat-square)
![Frontend](https://img.shields.io/badge/Frontend-JavaScript%20%2F%20CSS-orange?style=flat-square)
![Database](https://img.shields.io/badge/ORM-Prisma-teal?style=flat-square)
![Deployed](https://img.shields.io/badge/Deployed-Vercel-black?style=flat-square)

🌐 **Live Demo:** [bus-alert.vercel.app](https://bus-alert.vercel.app)

---

## 📖 About

**BusAlert** is a real-time bus tracking web app that triggers an alarm alert when your bus is exactly one stop away from your destination. Simply enter your bus route number and destination, arm the alarm, and let BusAlert handle the rest — so you can stop staring at your phone and enjoy the ride.

---

## ✨ Features

- 🔢 **Route & Destination Input** — Enter any bus number and destination stop
- 🔔 **One-Stop Alarm** — Automatically rings when the bus is one stop away
- 📋 **Live Logs** — View real-time tracking logs on screen and in the browser console
- 🗄️ **Prisma ORM** — Clean database management for routes and tracking data
- ⚡ **Full-Stack TypeScript** — Type-safe client and server

---

## 🚀 How to Use

1. Visit [bus-alert.vercel.app](https://bus-alert.vercel.app)
2. Enter your **Bus #** (route number) and **Destination** stop
3. Click **Arm the Alarm**
4. The alarm will ring when the bus is **one stop away** from your destination
5. Monitor the status via on-screen logs or browser console

---

## 🗂️ Project Structure

```
BusAlert/
├── client/              # Frontend (HTML, CSS, JavaScript)
├── server/              # Backend API (TypeScript / Node.js)
├── prisma/              # Prisma schema & migrations
├── prisma.config.ts     # Prisma configuration
├── package.json         # Project dependencies
├── vercel.json          # Vercel deployment config
└── README.md            # Documentation
```

---

## 🛠️ Built With

| Technology | Purpose |
|-----------|---------|
| TypeScript | Type-safe full-stack development |
| JavaScript | Client-side interactivity |
| CSS | Styling |
| Prisma | Database ORM |
| Vercel | Hosting & deployment |

---

## 💻 Local Development

### Prerequisites

- Node.js (v16+)
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/Siddharth2205/BusAlert.git
cd BusAlert

# Install dependencies
npm install

# Set up Prisma database
npx prisma migrate dev

# Start the development server
npm run dev
```

---

## 🤝 Contributing

Contributions, ideas, and bug reports are welcome!

1. Fork the repo
2. Create a branch (`git checkout -b feature/your-feature`)
3. Commit and push your changes
4. Open a Pull Request

---

## 📧 Contact

**Siddharth Modi**
📬 [sidinregina@gmail.com](mailto:sidinregina@gmail.com)
🐙 [github.com/Siddharth2205](https://github.com/Siddharth2205)

---

⭐ If BusAlert saved you from missing your bus, give it a star!
