# TripEasy – Trip Expense Splitter

TripEasy is a responsive React/Vite app backed by an Express API and MongoDB. Accounts use email verification, JWT sessions, bcrypt password hashes, and SMTP-delivered one-time codes. Personal trips and shared groups use the same trip and expense records.

## Requirements

- Node.js 20 or newer
- MongoDB
- An SMTP account for email verification and password recovery

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

## Configure MongoDB, JWT and email

The existing `backend/.env` is used by the server. Keep the existing `MONGODB_URI` and `JWT_SECRET` values. Configure the SMTP sender once in this file; signup users only enter their own recipient email in the app. Gmail defaults to `smtp.gmail.com` on port `587` with STARTTLS, so a Gmail sender needs these values:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=sender-account@gmail.com
SMTP_PASS=your-16-character-google-app-password
SMTP_FROM=
```

For Gmail, enable 2-Step Verification on the project owner's sender account and create a Google App Password; use that value for `SMTP_PASS`, not the normal account password. Remove any spaces when pasting it. `SMTP_FROM` is optional and defaults to `SMTP_USER`; Gmail requires the From address to be the authenticated account or an authorized alias. The signup recipient is taken from the submitted email field and can be a different Gmail address. Use port `465` with `SMTP_SECURE=true` if you prefer implicit TLS. For another SMTP provider, set its host, port, TLS setting, username, password, and permitted sender address. Restart the backend after changing `.env`. Never commit `backend/.env`; it is excluded by `.gitignore`. The frontend does not receive SMTP, MongoDB, or JWT secrets.

If the SMTP username or password is missing, the signup page explains which owner-only settings are needed. Authentication errors are logged on the backend with safe SMTP error codes and commands; credentials and OTP values are not logged.

Copy `backend/.env.example` when setting up another machine, and replace every placeholder with private values. OTPs are sent only by email, expire after five minutes, and are not returned to the frontend. Requests are limited to five per hour per email and one per minute; a code allows at most five attempts.

## Account flows

1. Sign up with a name, email, and matching password fields.
2. Choose **Send OTP**, enter the code received by email, and verify it.
3. Choose **Create Account**. The dashboard opens after the verified account is created.
4. Log in with the verified email and password. Use **Forgot Password?** for email-code recovery.
5. The sidebar opens Dashboard, Expenses, Profile, and Logout. Logout clears the session cookie.

## Trips, groups and expenses

New accounts start with no trips, members, expenses, groups, or sample data. Create a personal trip and enter its members, then use the Expenses page to add, edit, or delete expenses. Totals, per-person shares, contributions, settlements, Copy Summary, and PDF exports use the selected trip's MongoDB data.

Use **Create Group** to create a shared trip group. TripEasy returns a private six-character code once to the creator; share it manually. Other logged-in members can use **Join Group** with that code. The group admin is the creator, and every group member can view the group's shared expenses and chat. The same trip expense and settlement calculations are used for groups. Group and trip APIs check the authenticated user against the trip's owner or member list.

Group chat uses Socket.IO with the existing JWT session cookie. Messages are stored in MongoDB and loaded when a member opens the group. Chat rooms and message history are restricted to current group members. No separate paid chat service or frontend secret is used.

To verify a two-account group flow, create or sign in to two email-verified accounts in separate browsers. Account A creates a group and shares its displayed code; Account B joins with that code. Open the group from **My Groups** in both sessions, add expenses, and send a chat message to confirm it appears in the other session. Refresh either session to confirm the expense and message history remain available. Joining the same group again should return an already-a-member error. A code with an invalid format or unknown value is rejected, and accounts outside the group cannot view its details, expenses, or message history.

## Build

```powershell
npm run build
```
