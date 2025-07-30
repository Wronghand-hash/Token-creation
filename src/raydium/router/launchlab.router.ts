import express, { Request, Response, Router } from "express";
import multer from "multer";
import { createLaunchlabToken } from "../launchlab/createMint";
import BN from "bn.js";
import { LaunchpadRequest } from "../types/types";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

interface TokenRequest extends Request {
  body: any;
  file?: Express.Multer.File;
}

router.post(
  "/launchlab/create-token",
  upload.single("image"),
  async (req: TokenRequest, res: Response) => {
    try {
      const tokenData: LaunchpadRequest = req.body;

      if (req.file) {
        tokenData.imageBuffer = req.file.buffer;
        tokenData.imageFileName = req.file.originalname;
      }

      if (
        !tokenData.name ||
        !tokenData.symbol ||
        (!tokenData.uri && !tokenData.imageBuffer)
      ) {
        return res.status(400).json({
          error:
            "Missing required fields: name, symbol, and either uri or image file",
        });
      }

      if (tokenData.name.length > 32) {
        return res
          .status(400)
          .json({ error: "Name must be 32 characters or less" });
      }
      if (tokenData.symbol.length > 8) {
        return res
          .status(400)
          .json({ error: "Symbol must be 8 characters or less" });
      }
      if (tokenData.uri && tokenData.uri.length > 200) {
        return res
          .status(400)
          .json({ error: "URI must be 200 characters or less" });
      }
      if (
        tokenData.external_url &&
        !/^(https?:\/\/)/.test(tokenData.external_url)
      ) {
        return res
          .status(400)
          .json({ error: "external_url must be a valid URL" });
      }
      if (
        tokenData.decimals &&
        (isNaN(tokenData.decimals) ||
          tokenData.decimals < 0 ||
          tokenData.decimals > 9)
      ) {
        return res
          .status(400)
          .json({ error: "Decimals must be a number between 0 and 9" });
      }
      if (
        tokenData.migrateType &&
        !["amm" /* add other valid types */].includes(tokenData.migrateType)
      ) {
        return res.status(400).json({ error: "Invalid migrateType" });
      }

      if (tokenData.slippage) {
        tokenData.slippage = new BN(tokenData.slippage);
      }
      if (tokenData.buyAmount) {
        tokenData.buyAmount = new BN(tokenData.buyAmount);
      }

      const result = await createLaunchlabToken(tokenData);
      return res.json({ success: true, signature: result });
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
