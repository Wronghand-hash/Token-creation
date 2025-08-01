import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { AnchorProvider, utils, web3 } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { JitoBundler } from "../jito/jitoService";
import { TokenCreationRequest } from "./types/types";
import dotenv from "dotenv";
import { PinataService } from "../pinata/index";

dotenv.config();

export class TokenService {
  private readonly connection: Connection;
  private readonly jitoBundler: JitoBundler;
  private readonly programId: PublicKey = new PublicKey(
    "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
  );
  private readonly provider: AnchorProvider;
  private readonly pinataService: PinataService;
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
    CREATOR_VAULT: utils.bytes.utf8.encode("creator-vault"),
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
    this.pinataService = new PinataService();
  }

  async createPumpFunToken(req: TokenCreationRequest) {
    try {
      this.validateRequest(req);
      const creatorKeypair = this.getCreatorKeypair(req.creatorKeypair);
      const { tokenMint, bondingCurve, associatedBondingCurve } =
        await this.findAvailableAccounts();
      const uri = req.uri || (await this.pinataService.uploadMetadata(req));
      const latestBlockhash = await this.connection.getLatestBlockhash(
        "confirmed"
      );

      const pumpFunInstruction = await this.createPumpFunInstruction(
        tokenMint.publicKey,
        creatorKeypair.publicKey,
        { ...req, uri }
      );

      const transaction = new Transaction().add(pumpFunInstruction);

      // Add ATA creation and buy instruction if buyAmount is provided
      if (req.buyAmount && req.buyAmount > 0) {
        const lamportsBuyAmount = req.buyAmount * LAMPORTS_PER_SOL;
        const associatedUser = await web3.PublicKey.findProgramAddressSync(
          [
            creatorKeypair.publicKey.toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            tokenMint.publicKey.toBuffer(),
          ],
          ASSOCIATED_TOKEN_PROGRAM_ID
        )[0];

        const createATAInstruction = createAssociatedTokenAccountInstruction(
          creatorKeypair.publicKey, // Payer
          associatedUser, // ATA
          creatorKeypair.publicKey, // Owner
          tokenMint.publicKey
        );
        transaction.add(createATAInstruction);

        // Add buy instruction
        const buyInstruction = await this.createBuyInstruction(
          tokenMint.publicKey,
          creatorKeypair.publicKey,
          bondingCurve,
          associatedBondingCurve,
          associatedUser,
          lamportsBuyAmount
        );
        transaction.add(buyInstruction);
      }

      transaction.feePayer = creatorKeypair.publicKey;
      transaction.recentBlockhash = latestBlockhash.blockhash;
      transaction.sign(tokenMint, creatorKeypair);

      await this.simulateTransaction(transaction);

      return await this.submitTransaction(
        transaction,
        creatorKeypair,
        latestBlockhash,
        tokenMint
      );
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private validateRequest(req: TokenCreationRequest): void {
    if (
      !req.name ||
      !req.symbol ||
      !req.creatorKeypair ||
      (!req.uri && !req.imageBuffer)
    ) {
      throw new Error(
        "Missing required fields: name, symbol, creatorKeypair, and either uri or image file"
      );
    }

    if (req.name.length > 32) {
      throw new Error("Name must be 32 characters or less");
    }

    if (req.symbol.length > 8) {
      throw new Error("Symbol must be 8 characters or less");
    }

    if (req.uri && req.uri.length > 200) {
      throw new Error("URI must be 200 characters or less");
    }

    if (req.imageBuffer && req.imageBuffer.length > 1_000_000) {
      throw new Error("Image file must be less than 1MB for Pinata free tier");
    }

    if (req.external_url && !/^(https?:\/\/)/.test(req.external_url)) {
      throw new Error("external_url must be a valid URL");
    }

    if (req.buyAmount && (req.buyAmount <= 0 || isNaN(req.buyAmount))) {
      throw new Error("buyAmount must be a positive number");
    }
  }

  private getCreatorKeypair(secretKeyBase58: string): Keypair {
    const secretKey = bs58.decode(secretKeyBase58);
    if (secretKey.length !== 64) {
      throw new Error("Invalid creatorKeypair: must be 64 bytes");
    }
    return Keypair.fromSecretKey(secretKey);
  }

  private async findAvailableAccounts(): Promise<{
    tokenMint: Keypair;
    bondingCurve: PublicKey;
    associatedBondingCurve: PublicKey;
    metadata: PublicKey;
  }> {
    const maxAttempts = 20;
    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      const tokenMint = Keypair.generate();
      const bondingCurve = web3.PublicKey.findProgramAddressSync(
        [this.SEEDS.BONDING_CURVE, tokenMint.publicKey.toBuffer()],
        this.programId
      )[0];
      const associatedBondingCurve = web3.PublicKey.findProgramAddressSync(
        [
          bondingCurve.toBuffer(),
          this.SEEDS.ASSOCIATED_BONDING_CURVE_CONSTANT,
          tokenMint.publicKey.toBuffer(),
        ],
        new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
      )[0];
      const metadata = web3.PublicKey.findProgramAddressSync(
        [
          utils.bytes.utf8.encode("metadata"),
          this.SEEDS.METADATA_CONSTANT,
          tokenMint.publicKey.toBuffer(),
        ],
        new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
      )[0];

      const [
        mintAccountInfo,
        bondingCurveInfo,
        associatedBondingCurveInfo,
        metadataInfo,
      ] = await Promise.all([
        this.connection.getAccountInfo(tokenMint.publicKey),
        this.connection.getAccountInfo(bondingCurve),
        this.connection.getAccountInfo(associatedBondingCurve),
        this.connection.getAccountInfo(metadata),
      ]);

      if (
        !mintAccountInfo &&
        !bondingCurveInfo &&
        !associatedBondingCurveInfo &&
        !metadataInfo
      ) {
        return { tokenMint, bondingCurve, associatedBondingCurve, metadata };
      }
    }

    throw new Error(
      "Failed to find unused mint, bonding curve, or metadata accounts after maximum attempts"
    );
  }

  private async simulateTransaction(transaction: Transaction): Promise<void> {
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
  }

  private async submitTransaction(
    transaction: Transaction,
    creatorKeypair: Keypair,
    latestBlockhash: { blockhash: string; lastValidBlockHeight: number },
    tokenMint: Keypair
  ) {
    let result: { confirmed: boolean; signature?: string; error?: string };
    try {
      console.log("Attempting Jito bundler submission...");
      result = await this.jitoBundler.executeAndConfirm(
        transaction,
        creatorKeypair,
        latestBlockhash,
        [tokenMint]
      );
      if (result.confirmed) {
        console.log("Jito Transaction Signature:", result.signature);
      } else {
        console.log("Jito bundler failed:", result.error);
      }
    } catch (jitoError) {
      console.error("Jito Bundler Error:", JSON.stringify(jitoError, null, 2));
      result = {
        confirmed: false,
        error:
          jitoError instanceof Error
            ? jitoError.message
            : "Jito bundler failed",
      };
    }
    if (!result.confirmed) {
      result = await this.fallbackDirectSubmission(
        transaction,
        creatorKeypair,
        latestBlockhash,
        tokenMint
      );
    }

    return {
      success: result.confirmed,
      signature: result.signature,
      mintAddress: tokenMint.publicKey.toBase58(),
      error: result.error,
    };
  }

  private async fallbackDirectSubmission(
    transaction: Transaction,
    creatorKeypair: Keypair,
    latestBlockhash: { blockhash: string; lastValidBlockHeight: number },
    tokenMint: Keypair
  ): Promise<{ confirmed: boolean; signature?: string; error?: string }> {
    const maxRetries = 3;
    let result: { confirmed: boolean; signature?: string; error?: string } = {
      confirmed: false,
      error: "Direct submission failed",
    };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Direct submission attempt ${attempt}/${maxRetries}...`);
        if (attempt > 1) {
          const newBlockhash = await this.connection.getLatestBlockhash(
            "confirmed"
          );
          transaction.recentBlockhash = newBlockhash.blockhash;
          transaction.sign(tokenMint, creatorKeypair);
        }

        const signature = await this.connection.sendRawTransaction(
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
          return { confirmed: true, signature, error: undefined };
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
        result = {
          confirmed: false,
          signature: result.signature,
          error:
            directError instanceof Error
              ? directError.message
              : "Unknown error",
        };
      }
    }

    return result;
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
      { pubkey: mint, isSigner: true, isWritable: true },
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

  private async createBuyInstruction(
    mint: PublicKey,
    user: PublicKey,
    bondingCurve: PublicKey,
    associatedBondingCurve: PublicKey,
    associatedUser: PublicKey,
    buyAmount: number
  ): Promise<TransactionInstruction> {
    const discriminator = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);
    const global = web3.PublicKey.findProgramAddressSync(
      [this.SEEDS.GLOBAL],
      this.programId
    )[0];
    const creatorVault = web3.PublicKey.findProgramAddressSync(
      [this.SEEDS.CREATOR_VAULT, user.toBuffer()],
      this.programId
    )[0];
    const eventAuthority = web3.PublicKey.findProgramAddressSync(
      [this.SEEDS.EVENT_AUTHORITY],
      this.programId
    )[0];
    const feeRecipient = new PublicKey(
      "CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM"
    );

    // Convert buyAmount (lamports) to u64 buffer
    const amountBuffer = Buffer.alloc(8);
    amountBuffer.writeBigUInt64LE(BigInt(buyAmount));

    // Set max_sol_cost to a reasonable limit (buyAmount + 10% for fees)
    const maxSolCost = Math.floor(buyAmount * 1.1);
    const maxSolCostBuffer = Buffer.alloc(8);
    maxSolCostBuffer.writeBigUInt64LE(BigInt(maxSolCost));

    const data = Buffer.concat([discriminator, amountBuffer, maxSolCostBuffer]);

    const accounts = [
      { pubkey: global, isSigner: false, isWritable: false },
      { pubkey: feeRecipient, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: bondingCurve, isSigner: false, isWritable: true },
      { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
      { pubkey: associatedUser, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: creatorVault, isSigner: false, isWritable: true },
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
