# TripEasy – Trip Expense Splitter

TripEasy is a responsive React/Vite app backed by an Express API and MongoDB. Accounts use email and password authentication, JWT sessions, and bcrypt password hashes. Personal trips and shared groups use the same trip and expense records.

## Requirements

- Node.js 20 or newer
- MongoDB
- No email service is required for signup or login

## Install and run

Open this folder in VS Code and run these commands in its integrated terminal:

```powershell
npm install
npm --prefix frontend install
npm --prefix backend install
npm run dev
```

The frontend runs at `http://localhost:5173`; the API health endpoint is `http://localhost:5000/api/health`.

To run them separately, use two terminals:

```powershell
npm run dev:frontend
npm run dev:backend
```

## Configure MongoDB and JWT

The existing `backend/.env` is used by the server. Keep the existing `MONGODB_URI` and `JWT_SECRET` values. Signup and login do not require SMTP, Resend, or email OTP configuration. Never commit `backend/.env`; it is excluded by `.gitignore`. The frontend does not receive MongoDB or JWT secrets.

Copy `backend/.env.example` when setting up another machine and set a private MongoDB URI and a JWT secret of at least 32 bytes.

## Account flows

1. Sign up with a name, email, and matching password fields. Passwords are bcrypt-hashed before being saved; duplicate email addresses are rejected.
2. After account creation, TripEasy displays a success message and returns to Login. Signup does not create a session.
3. Log in with the registered email and password. Unregistered accounts and incorrect passwords receive the same clear credential error.
4. The sidebar opens Dashboard, Expenses, Profile, and Logout. Logout clears the session cookie.

## Trips, groups and expenses

New accounts start with no trips, members, expenses, groups, or sample data. Create a personal trip and enter its members, then use the Expenses page to add, edit, or delete expenses. Totals, per-person shares, contributions, settlements, Copy Summary, and PDF exports use the selected trip's MongoDB data.

Use **Create Group** to create a shared trip group. TripEasy returns a private six-character code once to the creator; share it manually. Other logged-in members can use **Join Group** with that code. The group admin is the creator, and every group member can view the group's shared expenses and chat. The same trip expense and settlement calculations are used for groups. Group and trip APIs check the authenticated user against the trip's owner or member list.

Group chat uses Socket.IO with the existing JWT session cookie. Messages are stored in MongoDB and loaded when a member opens the group. Chat rooms and message history are restricted to current group members. No separate paid chat service or frontend secret is used.

To verify a two-account group flow, create or sign in to two accounts in separate browsers. Account A creates a group and shares its displayed code; Account B joins with that code. Open the group from **My Groups** in both sessions, add expenses, and send a chat message to confirm it appears in the other session. Refresh either session to confirm the expense and message history remain available. Joining the same group again should return an already-a-member error. A code with an invalid format or unknown value is rejected, and accounts outside the group cannot view its details, expenses, or message history.

## Build

```powershell
npm run build
```
