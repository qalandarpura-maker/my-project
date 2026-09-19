# 🐺 Wolf Bots — Telegram Multi-Agent Support

Ye system ek customer support bot hai jisme:

- **Owner** - seed hone wala pehla user (`.env` se). Multiple Telegram bots ke tokens add karta hai, admins banata hai, agents bhi bana sakta hai.
- **Admin** - owner banata hai. Customer inbox dekhta hai, agents banata hai, conversations agent ko assign/forward karta hai.
- **Agent** - admin/owner banata hai. Dashboard pe login kar ke apni assigned chats reply karta hai (reply telegram pe customer tak `sendMessage` se jata hai).
- **Customer** - kisi bhi registered Telegram bot pe `/start` kare to record ban jata hai. Har message dashboard pe (realtime Socket.io) admins/agents ko dikhta hai.

## Install & Run (local)

Requirements: Node.js v18+, PostgreSQL. Local PostgreSQL ke liye `docker-compose.yml` included hai.

```bash
# 1. PostgreSQL start karo
docker compose up -d

# 2. Backend
cd backend
npm install
copy .env.example .env        # (Windows) phir .env me apni values daalo
npm run db:generate           # Prisma client generate karo
npm run db:migrate            # Database migrate karo
npm run seed                  # Owner account banao (OWNER_USERNAME/PASSWORD se)
npm run dev                   # http://localhost:4000

# 3. Alag terminal me: Frontend
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

Frontend me Vite proxy `/api` ko `http://localhost:4000` par bhejta hai, is liye browser me sirf `http://localhost:5173` use karo.

Default owner login `.env` me `OWNER_USERNAME` / `OWNER_PASSWORD` se set hota hai. Production me inhe zaroor change karo.

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

## Production me chalana (Render)

### 1. Render PostgreSQL

Render Dashboard me ek **PostgreSQL** database banao. Iska **Internal Database URL** environment variable `DATABASE_URL` me daalo.

### 2. Render Web Service (Backend)

- **Build command:** `npm install && npm run db:generate && npm run db:deploy`
- **Start command:** `npm start`

Required environment variables:

```env
DATABASE_URL="postgresql://..."
JWT_SECRET="long-random-string"
BOT_TOKEN_SECRET="exactly-32-characters-long"
OWNER_USERNAME="boss"
OWNER_PASSWORD="strong-owner-password"
OWNER_NAME="Owner"
FRONTEND_URL="https://your-frontend.onrender.com"
# R2 ke liye neeche dekhein
```

Pehli deploy ke baad Render shell me ja kar seed run karo:

```bash
cd backend
npm run seed
```

### 3. Frontend serve karna

Render static site ya Vercel/Netlify par frontend deploy karo:

```bash
cd frontend
npm install
npm run build
```

Build me `FRONTEND_URL` se CORS allow hoga. Multiple origins comma-separated de sakte hain.

### 4. Cloudflare R2 (Media uploads)

Agar aap images/documents Cloudflare R2 pe store karna chahte hain, bucket banao aur usse public access enable karo. Phir backend env vars me daalo:

```env
R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_BUCKET_NAME="wolf-bots-uploads"
R2_PUBLIC_URL="https://pub-<hash>.r2.dev"   # optional: custom public domain
```

Agar R2 env vars missing hain to uploads local disk pe store honge (sirf local dev ke liye recommended).

### 5. Bot long-polling note

Backend multiple bot tokens ko long-polling se run karta hai. Production me 1 bot process hi system rakhta hai. Backend ko public IP ki zaroorat nahi (polling outbound hai).

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
| GET | `/api/conversations/unread-count` | All | Total unread messages count |
| GET | `/api/conversations/:id` | All | Messages |
| POST | `/api/conversations/:id/read` | All (authorized) | Conversation mark as read |
| POST | `/api/conversations/:id/assign` | OWNER/ADMIN | Agent assign/forward |
| POST | `/api/conversations/:id/reply` | All (authorized) | Customer ko reply |
| POST | `/api/conversations/:id/send-media` | All (authorized) | Image/file customer ko bhejo (multipart: `file`, `caption`) |
| POST | `/api/conversations/:id/note` | OWNER/ADMIN | Agent ke liye private note (customer ko nahi jata) |
| POST | `/api/conversations/:id/note-media` | OWNER/ADMIN | Agent ke liye note me image/file |
| DELETE | `/api/conversations/:id/messages/:messageId` | Staff/own agent | Message delete (Telegram side se bhi) |
| POST | `/api/conversations/:id/close` | Staff / assigned agent | Conversation band |

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