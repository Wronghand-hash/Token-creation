import express, { Request, Response, Router } from "express";
import multer from "multer";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import {
  createBonkTokenTx,
  updateTokenSignatureLaunchlab,
} from "../launchlab/createMint";
import { JitoTransactionExecutor } from "../launchlab/executer";
import { LaunchpadRequest } from "../types/types";
import { getCreatorKeypair } from "../../utils/helpers";
import { connection } from "../config";

interface TokenRequest extends Request {
  body: LaunchpadRequest;
  file?: Express.Multer.File;
}

const JITO_FEE = 0.001;

const jitoExecutor = new JitoTransactionExecutor(
  JITO_FEE.toString(),
  connection,
  process.env.JITO_RPC_URL || ""
);
const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post(
  "/launchlab/create-token",
  upload.single("image"),
  async (req: TokenRequest, res: Response) => {
    try {
      const tokenData: LaunchpadRequest = req.body;

      if (req.file) {
        tokenData.image = req.file.buffer;
        tokenData.imageFileName = req.file.originalname;
      }

      // Required fields validation
      if (!tokenData.name || !tokenData.symbol) {
        return res.status(400).json({
          error: "Missing required fields: name and symbol",
        });
      }

      // Name validation (max 32 characters)
      if (tokenData.name.length > 32) {
        return res.status(400).json({
          error: "Name must be 32 characters or less",
        });
      }

      // Symbol validation (max 8 characters)
      if (tokenData.symbol.length > 8) {
        return res.status(400).json({
          error: "Symbol must be 8 characters or less",
        });
      }

      // Description validation (optional, max 200 characters)
      if (tokenData.description && tokenData.description.length > 200) {
        return res.status(400).json({
          error: "Description must be 200 characters or less",
        });
      }

      // URL validations
      const urlPattern = /^(https?:\/\/)/;
      if (tokenData.createdOn && !urlPattern.test(tokenData.createdOn)) {
        return res.status(400).json({
          error: "createdOn must be a valid URL",
        });
      }
      if (tokenData.website && !urlPattern.test(tokenData.website)) {
        return res.status(400).json({
          error: "website must be a valid URL",
        });
      }
      if (tokenData.twitter && !urlPattern.test(tokenData.twitter)) {
        return res.status(400).json({
          error: "twitter must be a valid URL",
        });
      }
      if (tokenData.telegram && !urlPattern.test(tokenData.telegram)) {
        return res.status(400).json({
          error: "telegram must be a valid URL",
        });
      }

      // Decimals validation
      if (
        tokenData.decimals &&
        (isNaN(tokenData.decimals) ||
          tokenData.decimals < 0 ||
          tokenData.decimals > 9)
      ) {
        return res.status(400).json({
          error: "Decimals must be a number between 0 and 9",
        });
      }

      // Migrate type validation
      if (tokenData.migrateType && !["amm"].includes(tokenData.migrateType)) {
        return res.status(400).json({
          error: "Invalid migrateType",
        });
      }

      // Slippage and buyAmount conversion to BN
      if (tokenData.slippage) {
        tokenData.slippage = new BN(tokenData.slippage);
      }
      if (tokenData.buyAmount) {
        tokenData.buyAmount = tokenData.buyAmount;
      }

      // Image validation
      if (!tokenData.image) {
        return res.status(400).json({
          error: "Image file is required",
        });
      }

      // Generate keypairs

      const mainKp = getCreatorKeypair(tokenData.creatorKeypair || "");
      const mintKp = Keypair.generate();

      // Create token transaction
      const transaction = await createBonkTokenTx(
        connection,
        mainKp,
        mintKp,
        tokenData
      );

      if (transaction) {
        console.log("Sending token creation transaction...");

        const latestBlockhash = await connection.getLatestBlockhash();
        const signature = await jitoExecutor.executeAndConfirm(
          transaction,
          mainKp,
          latestBlockhash
        );

        if (signature.confirmed) {
          console.log("Transaction successfully created and simulated!");
          // Return transaction details without executing
          if (signature.signature) {
            await updateTokenSignatureLaunchlab(
              mintKp.publicKey.toBase58(),
              signature.signature
            );
          }
          return res.json({
            success: true,
            signature: signature.signature,
            mintAddress: mintKp.publicKey.toBase58(),
          });
        } else {
          console.error("Failed to create the token transaction.");
          return res.status(500).json({
            error: "Failed to create the token transaction.",
          });
        }
      } else {
        console.error("Failed to create the token transaction.");
        return res.status(500).json({
          error: "Failed to create the token transaction.",
        });
      }
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : "Server error";
      const errorLogs = error.logs ? { logs: error.logs } : {};
      return res.status(500).json({
        error: errorMessage,
        ...errorLogs,
      });
    }
  }
);

export default router;
