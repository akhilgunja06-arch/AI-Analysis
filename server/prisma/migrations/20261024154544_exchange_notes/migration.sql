-- CreateTable
CREATE TABLE "ExchangeNote" (
    "id" UUID NOT NULL,
    "exchangeId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "resourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeNote_exchangeId_createdAt_idx" ON "ExchangeNote"("exchangeId", "createdAt");

-- AddForeignKey
ALTER TABLE "ExchangeNote" ADD CONSTRAINT "ExchangeNote_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeNote" ADD CONSTRAINT "ExchangeNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
