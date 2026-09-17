# 🐺 Wolf Bots — Telegram Multi-Agent Support

Ye system ek customer support bot hai jisme:

- **Owner** - seed hone wala pehla user (`.env` se). Multiple Telegram bots ke tokens add karta hai, admins banata hai, agents bhi bana sakta hai.
- **Admin** - owner banata hai. Customer inbox dekhta hai, agents banata hai, conversations agent ko assign/forward karta hai.
- **Agent** - admin/owner banata hai. Dashboard pe login kar ke apni assigned chats reply karta hai (reply telegram pe customer tak `sendMessage` se jata hai).
- **Customer** - kisi bhi registered Telegram bot pe `/start` kare to record ban jata hai. Har message dashboard pe (realtime Socket.io) admins/agents ko dikhta hai.

## Install & Run (local)

Requirements: Node.js v18+.

```bash
# Backend
cd backend
npm install
copy .env.example .env        # (Windows) phir .env me apni values daalo
npm run db:push               # SQLite DB banao
npm run seed                  # Owner account banao (OWNER_USERNAME/PASSWORD se)
npm run dev                   # http://localhost:4000

# Alag terminal me: Frontend
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

Frontend me Vite proxy `/api` ko `http://localhost:4000` par bhejta hai, is liye browser me sirf `http://localhost:5173` use karo.

Default owner login: `boss` / `owner123` (`.env` me `OWNER_USERNAME` / `OWNER_PASSWORD` change karo).

### Bot add karna

1. Telegram me `@BotFather` se bot banao aur token copy karo.
2. Dashboard me **Bots** page (owner) → token paste → **Add Bot**.
3. Customer us bot pe `/start` kare ya message bheje → dashboard Inbox me aata hai.
4. Admin Inbox me conversation select karke **Forward** dropdown se agent assign kare.
5. Agent **My Chats** me ja kar reply kare → customer ko Telegram pe message mill jata hai.

### Assign + imgs/notes

- **Assign/Forward:** admin conversation select karke dropdown me agent chune → "Forward" → chat turant us agent ke dashboard me aa jati hai.
- **Admin → Agent Note:** chat ke neeche purple **Note** box me likho → sirf agent ko dikhta hai, customer ko Telegram pe nahi jata. Note me image bhi attach ya `Ctrl+V` paste kar sakte ho — wo bhi sirf agent ko dikhegi.
- **Image attach:** chat box ke pas 🖼 button se image pick karo, **drag & drop** karo, ya `Ctrl+V` se clipboard paste karo → images pehle composer me **preview** mein aati hain. Phir **Enter ya Send** dabane se hi customer ko `sendPhoto` se jati hain (pehle nahi). Text saath ho to wo caption ban jata hai (pehli image pe). Customer ki taraf se aayi hui images bhi dashboard me dikhti hain.
- **Delete message (🗑):** message bubble par hover karo → 🗑 button. Apni sent messages delete kar sakte ho (agent apne, staff sab). Delete karne par customer ke Telegram se bhi woh bot-message delete ho jati hai (48 ghante ke andar Telegram allow karta hai).

### Greeting message

- Jab customer bao pe `/start` karta hai to bot usse greeting bhejta hai.
- Har bot ka alag greeting **Bots** page me **Edit** kar ke likha jata hai (`/api/owner/bots/:id/greeting`).

**Note:** Bot token new hone par botal must `@BotFather` se commands (e.g. `/start`) enable honghon; koi extra setup nahi.

## Production me chalana

### 1. PostgreSQL pe switch (recommended for production)

`backend/prisma/schema.prisma` me:

```prisma
datasource db {
  provider = "postgresql"      // was: sqlite
  url      = env("DATABASE_URL")
}
```

Phir:

```bash
cd backend
npx prisma generate
npx prisma migrate dev --name init   # ya: npx prisma db push
npm run seed
```

`.env` me:

```
DATABASE_URL="postgresql://user:password@host:5432/telegram_support"
```

### 2. Backend serve karna

```bash
cd backend
npm start           # PORT (default 4000)
```

### 3. Frontend serve karna

Build karke kisi hosting (Vercel/Netlify/Nginx) par daalo:

```bash
cd frontend
npm run build       # dist/ folder banega
```

Production me `/api` aur `/socket.io` proxy khud set karo (backend ko public URL par expose karo). Frontend me `FRONTEND_URL` backend ke `.env` me public origin ka comma-separated list daalo (CORS ke liye).

### 4. Bot long-polling note

Backend multiple bot tokens ko long-polling se run karta hai. Production me 1 bot process hi system rakhta hai. Kisi bhi option me backend public IP par hone ki zaroorat nahi (polling outbound hai). Saath me both server (backend) ek hi VPS par rakho taake 24/7 chale.

## API Overview

| Method | Endpoint | Role | Kya karta hai |
|--------|----------|------|---------------|
| POST | `/api/auth/login` | - | Login, JWT token |
| POST | `/api/owner/bots` | OWNER | Bot token verify + add |
| GET | `/api/owner/bots` | OWNER | Bots list |
| DELETE | `/api/owner/bots/:id` | OWNER | Bot delete |
| PATCH | `/api/owner/bots/:id/status` | OWNER | Start/Pause bot |
| PATCH | `/api/owner/bots/:id/greeting` | OWNER | Bot ka greeting change |
| POST | `/api/owner/admins` | OWNER | Admin banao |
| POST | `/api/owner/agents` | OWNER | Agent banao |
| POST | `/api/admin/agents` | ADMIN | Agent banao |
| GET | `/api/staff/agents` | OWNER/ADMIN | Agents list (assign dropdown) |
| GET | `/api/conversations` | All | Conversations (staff = sab, agent = assigned) |
| GET | `/api/conversations/:id` | All | Messages |
| POST | `/api/conversations/:id/assign` | OWNER/ADMIN | Agent assign/forward |
| POST | `/api/conversations/:id/reply` | All (authorized) | Customer ko reply |
| POST | `/api/conversations/:id/send-media` | All (authorized) | Image/file customer ko bhejo (multipart: `file`, `caption`) |
| POST | `/api/conversations/:id/note` | OWNER/ADMIN | Agent ke liye private note (customer ko nahi jata) |
| POST | `/api/conversations/:id/note-media` | OWNER/ADMIN | Agent ke liye note me image/file |
| DELETE | `/api/conversations/:id/messages/:messageId` | Staff/own agent | Message delete (Telegram side se bhi) |
| POST | `/api/conversations/:id/close` | All | Conversation band |

## Project Structure

```
backend/
  prisma/            # schema + seed
  src/
    controllers/     # auth, owner, conversation
    routes/          # auth, owner, admin, staff, conversations
    telegram/        # grammY handlers + bot manager
    lib/             # prisma, jwt, crypto(token encryption), socket
    middleware/      # JWT auth + role guard
    app.js server.js
frontend/
  src/
    pages/           # Login, Inbox, MyChats, Agents, Admins, Bots
    components/      # ChatWorkspace, ChatWindow, UserManager, Sidebar
    context/         # AuthContext
    api.js socket.js
```

## Security Notes

- Passwords bcrypt hash me store hote hain.
- Bot tokens AES-256-CBC encrypted store hote hain (`BOT_TOKEN_SECRET` se).
- JWT `7d` expiry (`.env` me `JWT_EXPIRES`).
- Agent sirf apni assigned conversations dekh/reply kar sakta hai.
- Production me **JWT_SECRET**, **BOT_TOKEN_SECRET** aur owner password zaroor change karo.