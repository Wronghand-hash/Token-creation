import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import pumpfunRoutes from "./pumpfun/pumpfun.handler";
import { Router } from "express";
import launchlabRouter from "./raydium/router/launchlab.router";
import { NextFunction, Request, Response } from "express";

dotenv.config();

const app = express();

app.use(helmet());

// Configure CORS with specific origins
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [
  "http://localhost:3000",
];
app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// --- Router Setup ---
const router = Router();
router.use("/api", launchlabRouter);
router.use("/api", pumpfunRoutes);
app.use(router);

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

// --- Server Start ---
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
