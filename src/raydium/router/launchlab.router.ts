import express, { Request, Response, Router } from "express";
import multer from "multer";
import { createLaunchlabToken } from "../launchlab/createMint";
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
      const tokenData = req.body;

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
            "Missing required fields: name, symbol, creatorKeypair, and either uri or image file",
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

      const result = await createLaunchlabToken(tokenData);

      if (result) {
        return res.json({ success: true, signature: result });
      } else {
        return res.status(500).json({ error: "Token creation failed" });
      }
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Server error",
      });
    }
  }
);

export default router;
