import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import { Program, AnchorProvider, web3, utils } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { PinataSDK } from "pinata";
import fs from "fs";
import { JitoBundler } from "../jito/jitoService";
import { TokenCreationRequest } from "./types/types";
import dotenv from "dotenv";

dotenv.config();

export class TokenService {
  private connection: Connection;
  private jitoBundler: JitoBundler;
  private programId: PublicKey = new PublicKey(
    "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
  );
  private readonly DECIMALS = 6; // PumpFun standard: 6 decimals
  private provider: AnchorProvider;
  private metadataCache: Map<string, string> = new Map();
  private pinata: PinataSDK;

  private readonly SEEDS = {
    MINT_AUTHORITY: utils.bytes.utf8.encode("mint-authority"),
    BONDING_CURVE: utils.bytes.utf8.encode("bonding-curve"),
    GLOBAL: utils.bytes.utf8.encode("global"),
    EVENT_AUTHORITY: utils.bytes.utf8.encode("__event_authority"),
    ASSOCIATED_BONDING_CURVE_CONSTANT: Buffer.from([
      6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206, 235, 121,
      172, 28, 180, 133, 237, 95, 91, 55, 145, 58, 140, 245, 133, 126, 255, 0,
      169,
    ]),
    METADATA_CONSTANT: Buffer.from([
      11, 112, 101, 177, 227, 209, 124, 69, 56, 157, 82, 127, 107, 4, 195, 205,
      88, 184, 108, 115, 26, 160, 253, 181, 73, 182, 209, 188, 3, 248, 41, 70,
    ]),
  };

  constructor() {
    const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
    this.connection = new Connection(rpcUrl, "confirmed");
    this.jitoBundler = new JitoBundler("1000000", this.connection);
    const wallet = new web3.Keypair();
    this.provider = new AnchorProvider(
      this.connection,
      {
        publicKey: wallet.publicKey,
        signTransaction: async () => {
          throw new Error("Dummy wallet");
        },
        signAllTransactions: async () => {
          throw new Error("Dummy wallet");
        },
      },
      { commitment: "confirmed" }
    );
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

  async createPumpFunToken(
    req: TokenCreationRequest
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    try {
      if (
        !req.name ||
        !req.symbol ||
        !req.creatorKeypair ||
        (!req.uri && !req.imagePath)
      ) {
        throw new Error(
          "Missing required fields: name, symbol, creatorKeypair, and either uri or imagePath"
        );
      }
      if (req.name.length > 32)
        throw new Error("Name must be 32 characters or less");
      if (req.symbol.length > 8)
        throw new Error("Symbol must be 8 characters or less");
      if (req.uri && req.uri.length > 200)
        throw new Error("URI must be 200 characters or less");
      if (req.imagePath) {
        if (!fs.existsSync(req.imagePath))
          req.imagePath = "../photo_2025-05-07_08-02-01.jpg";
        const stats = fs.statSync(req.imagePath);
        if (stats.size > 1_000_000)
          throw new Error(
            "Image file must be less than 1MB for Pinata free tier"
          );
      }
      if (req.external_url && !/^(https?:\/\/)/.test(req.external_url)) {
        throw new Error("external_url must be a valid URL");
      }

      let creatorKeypair: Keypair;
      try {
        const secretKey = bs58.decode(req.creatorKeypair);
        if (secretKey.length !== 64)
          throw new Error("Invalid creatorKeypair: must be 64 bytes");
        creatorKeypair = Keypair.fromSecretKey(secretKey);
      } catch {
        throw new Error(
          "Invalid creatorKeypair: must be base58-encoded private key"
        );
      }
      let tokenMint: Keypair;
      let bondingCurve: PublicKey;
      let associatedBondingCurve: PublicKey;
      let metadata: PublicKey;
      let attempts = 0;
      const maxAttempts = 20;
      let bondingCurveInfo;
      let associatedBondingCurveInfo;
      let mintAccountInfo;
      let metadataInfo;

      do {
        if (attempts >= maxAttempts) {
          throw new Error(
            "Failed to find unused mint, bonding curve, or metadata accounts after maximum attempts"
          );
        }

        tokenMint = Keypair.generate();
        bondingCurve = web3.PublicKey.findProgramAddressSync(
          [this.SEEDS.BONDING_CURVE, tokenMint.publicKey.toBuffer()],
          this.programId
        )[0];
        associatedBondingCurve = web3.PublicKey.findProgramAddressSync(
          [
            bondingCurve.toBuffer(),
            this.SEEDS.ASSOCIATED_BONDING_CURVE_CONSTANT,
            tokenMint.publicKey.toBuffer(),
          ],
          new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
        )[0];
        metadata = web3.PublicKey.findProgramAddressSync(
          [
            utils.bytes.utf8.encode("metadata"),
            this.SEEDS.METADATA_CONSTANT,
            tokenMint.publicKey.toBuffer(),
          ],
          new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
        )[0];

        // Check if accounts already exist
        mintAccountInfo = await this.connection.getAccountInfo(
          tokenMint.publicKey
        );
        bondingCurveInfo = await this.connection.getAccountInfo(bondingCurve);
        associatedBondingCurveInfo = await this.connection.getAccountInfo(
          associatedBondingCurve
        );
        metadataInfo = await this.connection.getAccountInfo(metadata);

        attempts++;
      } while (
        mintAccountInfo !== null ||
        bondingCurveInfo !== null ||
        associatedBondingCurveInfo !== null ||
        metadataInfo !== null
      );

      const uri = req.uri || (await this.uploadMetadata(req));

      const latestBlockhash = await this.connection.getLatestBlockhash(
        "confirmed"
      );

      const pumpFunInstruction = await this.createPumpFunInstruction(
        tokenMint.publicKey,
        creatorKeypair.publicKey,
        { ...req, uri }
      );

      const transaction = new Transaction().add(pumpFunInstruction);

      transaction.feePayer = creatorKeypair.publicKey;
      transaction.recentBlockhash = latestBlockhash.blockhash;
      transaction.sign(tokenMint, creatorKeypair); // Sign with both tokenMint and creatorKeypair

      // Re-check accounts just before submission to avoid race conditions
      const recheckAccounts = await Promise.all([
        this.connection.getAccountInfo(tokenMint.publicKey),
        this.connection.getAccountInfo(bondingCurve),
        this.connection.getAccountInfo(associatedBondingCurve),
        this.connection.getAccountInfo(metadata),
      ]);

      if (recheckAccounts.some((info) => info !== null)) {
        throw new Error(
          `One or more accounts became occupied before transaction submission: ` +
            `Mint: ${tokenMint.publicKey.toBase58()}, ` +
            `BondingCurve: ${bondingCurve.toBase58()}, ` +
            `AssociatedBondingCurve: ${associatedBondingCurve.toBase58()}, ` +
            `Metadata: ${metadata.toBase58()}`
        );
      }

      // Log account addresses and transaction details for debugging
      console.log("Creator Public Key:", creatorKeypair.publicKey.toBase58());
      console.log("Mint Address:", tokenMint.publicKey.toBase58());
      console.log("Bonding Curve Address:", bondingCurve.toBase58());
      console.log(
        "Associated Bonding Curve Address:",
        associatedBondingCurve.toBase58()
      );
      console.log("Metadata Address:", metadata.toBase58());
      console.log(
        "Creator Balance:",
        (await this.connection.getBalance(creatorKeypair.publicKey)) /
          web3.LAMPORTS_PER_SOL,
        "SOL"
      );
      console.log(
        "Transaction (Base64):",
        transaction
          .serialize({ requireAllSignatures: false })
          .toString("base64")
      );

      // Log account states before transaction
      console.log(
        "Mint Account Before:",
        await this.connection.getAccountInfo(tokenMint.publicKey)
      );
      console.log(
        "Bonding Curve Account Before:",
        await this.connection.getAccountInfo(bondingCurve)
      );
      console.log(
        "Associated Bonding Curve Account Before:",
        await this.connection.getAccountInfo(associatedBondingCurve)
      );
      console.log(
        "Metadata Account Before:",
        await this.connection.getAccountInfo(metadata)
      );

      // Simulate the transaction for debugging
      const simulationResult = await this.connection.simulateTransaction(
        transaction
      );
      console.log(
        "Simulation Result:",
        JSON.stringify(simulationResult, null, 2)
      );

      if (simulationResult.value.err) {
        throw new Error(
          `Transaction simulation failed: ${JSON.stringify(
            simulationResult.value.err
          )}`
        );
      }

      // Try Jito bundler first
      let result;
      try {
        console.log("Attempting Jito bundler submission...");
        result = await this.jitoBundler.executeAndConfirm(
          transaction,
          creatorKeypair,
          latestBlockhash
        );
        if (result.confirmed) {
          console.log("Jito Transaction Signature:", result.signature);
        } else {
          console.log("Jito bundler failed:", result.error);
        }
      } catch (jitoError) {
        console.error(
          "Jito Bundler Error:",
          JSON.stringify(jitoError, null, 2)
        );
        result = {
          confirmed: false,
          error:
            jitoError instanceof Error
              ? jitoError.message
              : "Jito bundler failed",
        };
      }

      // Fall back to direct submission if Jito fails
      if (!result.confirmed) {
        console.log("Falling back to direct transaction submission...");
        const maxRetries = 3;
        let signature;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(
              `Direct submission attempt ${attempt}/${maxRetries}...`
            );
            // Refresh blockhash if necessary
            if (attempt > 1) {
              const newBlockhash = await this.connection.getLatestBlockhash(
                "confirmed"
              );
              transaction.recentBlockhash = newBlockhash.blockhash;
              transaction.sign(tokenMint, creatorKeypair); // Re-sign with new blockhash
            }
            signature = await this.connection.sendRawTransaction(
              transaction.serialize()
            );
            console.log("Direct Transaction Signature:", signature);

            const confirmation = await this.connection.confirmTransaction(
              {
                signature,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
              },
              "confirmed"
            );
            console.log(
              "Direct Confirmation:",
              JSON.stringify(confirmation, null, 2)
            );

            if (!confirmation.value.err) {
              result = { confirmed: true, signature, error: undefined };
              break;
            } else {
              result = {
                confirmed: false,
                signature,
                error: `Direct submission failed: ${JSON.stringify(
                  confirmation.value.err
                )}`,
              };
            }
          } catch (directError) {
            console.error(
              `Direct submission attempt ${attempt} failed:`,
              directError
            );
            if (attempt === maxRetries) {
              result = {
                confirmed: false,
                signature,
                error:
                  directError instanceof Error
                    ? directError.message
                    : "Unknown error",
              };
            }
          }
        }
      }

      // Log account states after transaction
      console.log(
        "Mint Account After:",
        await this.connection.getAccountInfo(tokenMint.publicKey)
      );
      console.log(
        "Bonding Curve Account After:",
        await this.connection.getAccountInfo(bondingCurve)
      );
      console.log(
        "Associated Bonding Curve Account After:",
        await this.connection.getAccountInfo(associatedBondingCurve)
      );
      console.log(
        "Metadata Account After:",
        await this.connection.getAccountInfo(metadata)
      );
      console.log(
        "Creator Balance After:",
        (await this.connection.getBalance(creatorKeypair.publicKey)) /
          web3.LAMPORTS_PER_SOL,
        "SOL"
      );
      return {
        success: result.confirmed,
        signature: result.signature,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async uploadMetadata(req: TokenCreationRequest): Promise<string> {
    const cacheKey = `${req.name}:${req.symbol}:${req.imagePath}:${
      req.description || ""
    }:${req.external_url || ""}:${JSON.stringify(req.attributes || [])}`;
    if (this.metadataCache.has(cacheKey)) {
      return this.metadataCache.get(cacheKey)!;
    }

    try {
      // Validate Pinata configuration
      if (!process.env.PINATA_API_KEY || !process.env.PINATA_SECRET_API_KEY) {
        throw new Error(
          "PINATA_API_KEY or PINATA_API_SECRET not set in environment variables"
        );
      }

      const imageFile = new File(
        [fs.readFileSync(req.imagePath)],
        `${req.symbol}.png`,
        { type: "image/png" }
      );
      const imageUpload = await this.pinata.upload.public.file(imageFile);
      if (!imageUpload.cid) {
        throw new Error("Failed to upload image to Pinata IPFS");
      }
      const imageUrl = `https://ipfs.io/ipfs/${imageUpload.cid}`;
      console.log("Generated Image URL:", imageUrl); // Log for debugging

      const metadata = {
        name: req.name,
        symbol: req.symbol,
        description: req.description || "A Pump.fun token",
        image: imageUrl,
        external_url: req.external_url || "",
        attributes: req.attributes || [],
        properties: {
          files: [{ uri: imageUrl, type: "image/png" }],
          category: "image",
        },
      };

      const metadataUpload = await this.pinata.upload.public.json(metadata);
      if (!metadataUpload.cid) {
        throw new Error("Failed to upload metadata JSON to Pinata IPFS");
      }

      const uri = `https://ipfs.io/ipfs/${metadataUpload.cid}`;
      this.metadataCache.set(cacheKey, uri);
      console.log("Generated Metadata URI:", uri); // Log for debugging
      return uri;
    } catch (error) {
      throw new Error(
        `Pinata IPFS upload failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async createPumpFunInstruction(
    mint: PublicKey,
    creator: PublicKey,
    tokenData: TokenCreationRequest
  ): Promise<TransactionInstruction> {
    const discriminator = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]);

    const mintAuthority = web3.PublicKey.findProgramAddressSync(
      [this.SEEDS.MINT_AUTHORITY],
      this.programId
    )[0];

    const bondingCurve = web3.PublicKey.findProgramAddressSync(
      [this.SEEDS.BONDING_CURVE, mint.toBuffer()],
      this.programId
    )[0];

    const associatedBondingCurve = web3.PublicKey.findProgramAddressSync(
      [
        bondingCurve.toBuffer(),
        this.SEEDS.ASSOCIATED_BONDING_CURVE_CONSTANT,
        mint.toBuffer(),
      ],
      new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
    )[0];

    const global = web3.PublicKey.findProgramAddressSync(
      [this.SEEDS.GLOBAL],
      this.programId
    )[0];

    const metadata = web3.PublicKey.findProgramAddressSync(
      [
        utils.bytes.utf8.encode("metadata"),
        this.SEEDS.METADATA_CONSTANT,
        mint.toBuffer(),
      ],
      new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
    )[0];

    const eventAuthority = web3.PublicKey.findProgramAddressSync(
      [this.SEEDS.EVENT_AUTHORITY],
      this.programId
    )[0];

    const nameBuffer = Buffer.from(tokenData.name);
    const symbolBuffer = Buffer.from(tokenData.symbol);
    const uriBuffer = Buffer.from(tokenData.uri || "");

    const data = Buffer.concat([
      discriminator,
      Buffer.from([nameBuffer.length, 0, 0, 0]),
      nameBuffer,
      Buffer.from([symbolBuffer.length, 0, 0, 0]),
      symbolBuffer,
      Buffer.from([uriBuffer.length, 0, 0, 0]),
      uriBuffer,
      creator.toBuffer(),
    ]);

    const accounts = [
      { pubkey: mint, isSigner: true, isWritable: true }, // Reverted to isSigner: true per IDL
      { pubkey: mintAuthority, isSigner: false, isWritable: false },
      { pubkey: bondingCurve, isSigner: false, isWritable: true },
      { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
      { pubkey: global, isSigner: false, isWritable: false },
      {
        pubkey: new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
        isSigner: false,
        isWritable: false,
      },
      { pubkey: metadata, isSigner: false, isWritable: true },
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      {
        pubkey: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"),
        isSigner: false,
        isWritable: false,
      },
      { pubkey: eventAuthority, isSigner: false, isWritable: false },
      { pubkey: this.programId, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
      keys: accounts,
      programId: this.programId,
      data,
    });
  }
}
