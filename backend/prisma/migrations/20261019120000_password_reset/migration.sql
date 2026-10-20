/*
  Forgetting a password.

  Until now there was no way to change a password at all — signed in or out — so
  a forgotten one meant a lost account. Two columns' worth of machinery:

  - `password_reset_tokens` holds the SHA-256 of a one-time token, never the
    token. A copy of this table is therefore useless to whoever reads it, which
    is the same reasoning as the `passwordHash` beside it. One hour, single use,
    and a user's others are invalidated whenever one is minted or spent.

  - `users.passwordChangedAt` is what makes a reset mean something. A session
    token is stateless and lasts seven days, so without this the device the reset
    was meant to shut out would stay signed in until the following week.
    `requireAuth` compares it with the token's `iat`.

  Null `passwordChangedAt` on every existing row is correct: nobody's password
  has ever changed, so no token issued before now should be refused.
*/

-- AlterTable
ALTER TABLE "users" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
