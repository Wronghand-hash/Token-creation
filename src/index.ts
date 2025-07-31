import express from "express";
import dotenv from "dotenv";
import { Keypair } from "@solana/web3.js";
import { createBonkTokenTx } from "./raydium/launchlab/createMint";
import { connection, owner } from "./raydium/config";
dotenv.config();

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
