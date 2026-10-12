# 🌍 TripEasy – Trip Expense Splitter

TripEasy is a full-stack web application that helps users manage personal trips, split expenses, organize group trips, and track shared spending. It includes group chat, expense summaries, settlement calculations, and PDF exports.

## 🚀 Live Demo

**Website:** https://trip-easy-eight.vercel.app

## ✨ Features

* 🔐 **User Authentication** – Signup and login with email and password.
* 🧳 **Personal Trips** – Create and manage individual trips.
* 👥 **Group Trips** – Create groups and invite members using a unique group code.
* 💰 **Expense Management** – Add, edit, and delete trip expenses.
* 🧮 **Expense Splitting** – Calculate per-person shares and contributions.
* 🤝 **Settlements** – Track who owes whom.
* 💬 **Group Chat** – Communicate with group members in real time.
* 🗑️ **Group Management** – Manage groups and remove members.
* 📄 **PDF Export** – Export expense summaries as PDF files.
* 📋 **Copy Summary** – Copy trip expense summaries.
* 🔒 **Protected APIs** – JWT-based authentication and access checks.
* 📱 **Responsive UI** – Use the application on different screen sizes.
* 🗄️ **MongoDB Storage** – Store user accounts, trips, expenses, and messages.

## 🛠️ Tech Stack

**Frontend**

* React.js
* Vite
* JavaScript
* HTML5
* CSS3

**Backend**

* Node.js
* Express.js
* REST API
* Socket.IO

**Database & Security**

* MongoDB
* JWT Authentication
* bcryptjs
* HTTP-only session cookies

**Tools**

* Git & GitHub
* VS Code
* Vercel
* Render

## 📋 Requirements

* Node.js 20 or newer
* MongoDB
* Git
* VS Code (recommended)

## ⚙️ Installation and Setup

### 1. Clone the Repository

```bash
git clone https://github.com/daksh9361/TripEasy.git
cd TripEasy
```

### 2. Install Dependencies

```bash
npm install
npm --prefix frontend install
npm --prefix backend install
```

### 3. Configure Environment Variables

Create or configure `backend/.env` using `backend/.env.example`.

Add your own MongoDB connection string and a secure JWT secret.

```env
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_secure_jwt_secret
PORT=5000
```

Use the variable names and other settings required by your existing `.env.example` file.

**Important:** Never upload `.env` files, database credentials, JWT secrets, or other sensitive information to GitHub.

### 4. Start the Application

```bash
npm run dev
```

The frontend runs at:

`http://localhost:5173`

The backend API runs at:

`http://localhost:5000`

API health check:

`http://localhost:5000/api/health`

You can also start the frontend and backend separately:

```bash
npm run dev:frontend
npm run dev:backend
```

## 👤 How to Use

1. Create an account using the signup page.
2. Log in with your registered email and password.
3. Create a personal trip or a shared group.
4. Share the group code with other registered users.
5. Add expenses and manage shared spending.
6. Use settlement calculations to understand who owes whom.
7. Chat with group members and export expense summaries.

## 🏗️ Project Structure

```text
TripEasy/
├── frontend/
│   └── src/
├── backend/
│   ├── routes/
│   ├── models/
│   └── server.js
├── package.json
├── .gitignore
└── README.md
```

The exact files and folders may vary depending on the current implementation.

## 🧪 Build

To create a production build of the frontend:

```bash
npm run build
```

## 🔐 Security

* Passwords are hashed before being stored.
* Authentication uses JWT-based sessions.
* Protected APIs verify user access.
* Group data is restricted to authorized members.
* Environment variables are used for sensitive configuration.

## 🔮 Future Improvements

* Online payment integration for settlements.
* More detailed expense analytics.
* Trip notifications and reminders.
* Enhanced mobile experience.

## 👨‍💻 Author

**Ajay Kumar**

* GitHub: https://github.com/daksh9361
* LinkedIn: https://www.linkedin.com/in/ajay-kumar-a01755315

---

⭐ If you find this project useful, consider giving it a star on GitHub.
