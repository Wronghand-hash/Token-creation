import dotenv from "dotenv";

dotenv.config();

export const productionConfig = {
  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "5432"),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    dialect: "postgres",
    logging: false, // Disable query logging in production
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    ssl: {
      require: false,
      rejectUnauthorized: false,
    },
  },
};
