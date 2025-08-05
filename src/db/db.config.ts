import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Database configuration
export const dbConfig = {
  name: process.env.DB_NAME || "kols_manager",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  dialect: "postgres",
  logging: process.env.NODE_ENV === "development" ? console.log : false,
};
export default {
  db: dbConfig,
};
