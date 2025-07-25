import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const downloads = pgTable("downloads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  youtubeUrl: text("youtube_url").notNull(),
  title: text("title").notNull(),
  duration: text("duration"),
  thumbnail: text("thumbnail"),
  channel: text("channel"),
  views: text("views"),
  publishDate: text("publish_date"),
  format: text("format").notNull().default("mp4"),
  status: text("status").notNull().default("pending"), // pending, downloading, completed, failed
  progress: integer("progress").default(0),
  filePath: text("file_path"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertDownloadSchema = createInsertSchema(downloads).pick({
  youtubeUrl: true,
  title: true,
  duration: true,
  thumbnail: true,
  channel: true,
  views: true,
  publishDate: true,
  format: true,
});

export const videoAnalysisSchema = z.object({
  url: z.string().url().refine(
    (url) => url.includes("youtube.com/watch") || url.includes("youtu.be/"),
    { message: "Please enter a valid YouTube URL" }
  ),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertDownload = z.infer<typeof insertDownloadSchema>;
export type Download = typeof downloads.$inferSelect;
export type VideoAnalysis = z.infer<typeof videoAnalysisSchema>;
