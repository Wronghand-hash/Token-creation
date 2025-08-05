import { PinataSDK } from "pinata";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

export class PinataService {
  private readonly pinata: PinataSDK;

  constructor() {
    const pinataJwt = process.env.PINATA_JWT;
    const pinataGateway = process.env.PINATA_GATEWAY;

    if (!pinataJwt || !pinataGateway) {
      throw new Error(
        "Pinata credentials (PINATA_JWT, PINATA_GATEWAY) missing in .env"
      );
    }

    this.pinata = new PinataSDK({
      pinataJwt,
      pinataGateway,
    });
  }

  private getCreatorKeypair(secretKeyBase58: string): Keypair {
    const secretKey = bs58.decode(secretKeyBase58);
    if (secretKey.length !== 64) {
      throw new Error("Invalid creatorKeypair: must be 64 bytes");
    }
    return Keypair.fromSecretKey(secretKey);
  }

  async uploadMetadata(req: any): Promise<{ uri: string; imageUrl: string }> {
    if (!req.imageBuffer || !req.imageFileName) {
      throw new Error(
        "Image buffer and filename are required for metadata upload"
      );
    }

    const imageFile = new File([req.imageBuffer], req.imageFileName, {
      type: "image/png",
    });

    const imageUpload = await this.pinata.upload.public.file(imageFile);
    if (!imageUpload.cid) {
      throw new Error("Failed to upload image to Pinata IPFS");
    }

    console.log("Image CID:", imageUpload.cid);
    const imageUrl = `${process.env.PINATA_GATEWAY}/ipfs/${imageUpload.cid}`;

    const creatorKeypair =
      req.owner || this.getCreatorKeypair(req.creatorKeypair);

    const metadata = {
      name: req.name.slice(0, 32),
      symbol: req.symbol.slice(0, 8),
      description: req.description || "A Pump.fun token",
      image: imageUrl,
      external_url: req.external_url || "",
      attributes: req.attributes || [],
      properties: {
        files: [{ uri: imageUrl, type: "image/png" }],
        category: "image",
        creators: [
          {
            address: req.owner || creatorKeypair.publicKey.toBase58(),
            share: 100,
          },
        ],
      },
      seller_fee_basis_points: 0,
    };

    const metadataUpload = await this.pinata.upload.public.json(metadata);
    if (!metadataUpload.cid) {
      throw new Error("Failed to upload metadata JSON to Pinata IPFS");
    }

    console.log("Metadata CID:", metadataUpload.cid);
    const uri = `https://${process.env.PINATA_GATEWAY}/ipfs/${metadataUpload.cid}`;
    console.log("Generated Metadata URI:", uri);

    return {
      uri,
      imageUrl,
    };
  }
}
