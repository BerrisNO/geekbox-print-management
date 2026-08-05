import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** user_account — singleton (FR-001). */
export const userAccount = sqliteTable('user_account', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** session — DB-backed opaque session (FR-002, ADR-007). */
export const session = sqliteTable('session', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => userAccount.id),
  createdAt: integer('created_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
