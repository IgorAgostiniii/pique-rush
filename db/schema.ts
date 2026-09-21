import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const rooms = sqliteTable('rooms', {
  code: text('code').primaryKey(), blue: text('blue').notNull(), red: text('red'),
  state: text('state').notNull(), revision: integer('revision').notNull().default(0),
  expires: integer('expires').notNull(),
});
