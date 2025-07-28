import express, { Request, Response } from "express";
import { TokenService } from "./pumpfun/tokenService";
import { TokenCreationRequest } from "./pumpfun/types/types";
import dotenv from "dotenv";
import multer from "multer";

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());

const tokenService = new TokenService();

app.post(
  "/api/create-token",
  upload.single("image"),
  async (req: any, res: Response) => {
    try {
      const tokenData = req.body;

      // Handle uploaded image
      if (req.file) {
        tokenData.imageBuffer = req.file.buffer;
        tokenData.imageFileName = req.file.originalname;
      }

      // Validate input
      if (
        !tokenData.name ||
        !tokenData.symbol ||
        !tokenData.creatorKeypair ||
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

      const result = await tokenService.createPumpFunToken(tokenData);

      if (result.success) {
        res.json({ success: true, signature: result.signature });
      } else {
        res
          .status(500)
          .json({ error: result.error || "Token creation failed" });
      }
    } catch (error) {
      res
        .status(500)
        .json({
          error: error instanceof Error ? error.message : "Server error",
        });
    }
  }
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
