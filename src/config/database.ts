import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http"
import { config } from "dotenv";

//load all the envs
config({ path: '.env' });

if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL is undefined');

//init neon client
const sql = neon(process.env.DATABASE_URL);

//init drizzle
export const db = drizzle(sql);
