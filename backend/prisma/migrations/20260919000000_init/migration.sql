-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdById" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bot" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "botTokenEnc" TEXT NOT NULL,
    "botUsername" TEXT NOT NULL,
    "botName" TEXT,
    "greeting" TEXT NOT NULL DEFAULT '👋 Assalam o Alaikum! Aap ka message hamari support team ko mil gaya hai. Jald hi iska jawab milega. Shukriya!',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "botId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "telegramUser" TEXT,
    "assignedAgentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unassigned',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "senderUserId" TEXT,
    "text" TEXT NOT NULL,
    "mediaType" TEXT,
    "mediaUrl" TEXT,
    "telegramMessageId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Bot_botUsername_key" ON "Bot"("botUsername");

-- CreateIndex
CREATE INDEX "Customer_assignedAgentId_status_idx" ON "Customer"("assignedAgentId", "status");

-- CreateIndex
CREATE INDEX "Customer_lastMessageAt_idx" ON "Customer"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_telegramId_botId_key" ON "Customer"("telegramId", "botId");

-- CreateIndex
CREATE INDEX "Message_customerId_createdAt_idx" ON "Message"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bot" ADD CONSTRAINT "Bot_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
