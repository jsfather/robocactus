import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const authSchema = pgSchema('auth')
export const privateSchema = pgSchema('app_private')

export const users = authSchema.table('users', {
  id: uuid('id').primaryKey(),
  email: text('email').unique(),
  username: text('username').unique(),
  encryptedPassword: text('encrypted_password'),
  phone: text('phone').unique(),
  rawUserMetaData: jsonb('raw_user_meta_data').notNull().default({}),
  emailConfirmedAt: timestamp('email_confirmed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sessions = privateSchema.table(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
)

export const oneTimeTokens = privateSchema.table(
  'one_time_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    kind: text('kind').notNull(),
    redirectTo: text('redirect_to'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('one_time_tokens_hash_idx').on(table.tokenHash)],
)

export const realtimeEvents = privateSchema.table('realtime_events', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  tableName: text('table_name').notNull(),
  event: text('event').notNull(),
  record: jsonb('record'),
  oldRecord: jsonb('old_record'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const storageObjects = privateSchema.table(
  'storage_objects',
  {
    id: uuid('id').primaryKey(),
    bucket: text('bucket').notNull(),
    objectPath: text('object_path').notNull(),
    diskPath: text('disk_path').notNull(),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    mimeType: text('mime_type'),
    size: integer('size').notNull(),
    isPublic: boolean('is_public').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').notNull().default({}),
  },
  (table) => [index('storage_objects_bucket_path_idx').on(table.bucket, table.objectPath)],
)
