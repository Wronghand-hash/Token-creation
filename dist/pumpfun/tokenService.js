"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenService = void 0;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const anchor_1 = require("@coral-xyz/anchor");
const bs58_1 = __importDefault(require("bs58"));
const pinata_1 = require("pinata");
const fs_1 = __importDefault(require("fs"));
const jitoService_1 = require("../jito/jitoService");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
class TokenService {
    constructor() {
        this.programId = new web3_js_1.PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
        this.DECIMALS = 6; // PumpFun standard: 6 decimals
        this.metadataCache = new Map();
        this.SEEDS = {
            MINT_AUTHORITY: anchor_1.utils.bytes.utf8.encode("mint-authority"),
            BONDING_CURVE: anchor_1.utils.bytes.utf8.encode("bonding-curve"),
            GLOBAL: anchor_1.utils.bytes.utf8.encode("global"),
            EVENT_AUTHORITY: anchor_1.utils.bytes.utf8.encode("__event_authority"),
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
        const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
        this.connection = new web3_js_1.Connection(rpcUrl, "confirmed");
        this.jitoBundler = new jitoService_1.JitoBundler("1000000", this.connection);
        const wallet = new anchor_1.web3.Keypair();
        this.provider = new anchor_1.AnchorProvider(this.connection, {
            publicKey: wallet.publicKey,
            signTransaction: () => __awaiter(this, void 0, void 0, function* () {
                throw new Error("Dummy wallet");
            }),
            signAllTransactions: () => __awaiter(this, void 0, void 0, function* () {
                throw new Error("Dummy wallet");
            }),
        }, { commitment: "confirmed" });
        const pinataJwt = process.env.PINATA_JWT;
        const pinataGateway = process.env.PINATA_GATEWAY;
        if (!pinataJwt || !pinataGateway) {
            throw new Error("Pinata credentials (PINATA_JWT, PINATA_GATEWAY) missing in .env");
        }
        this.pinata = new pinata_1.PinataSDK({
            pinataJwt,
            pinataGateway,
        });
    }
    createPumpFunToken(req) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.name ||
                    !req.symbol ||
                    !req.creatorKeypair ||
                    (!req.uri && !req.imagePath)) {
                    throw new Error("Missing required fields: name, symbol, creatorKeypair, and either uri or imagePath");
                }
                if (req.name.length > 32)
                    throw new Error("Name must be 32 characters or less");
                if (req.symbol.length > 8)
                    throw new Error("Symbol must be 8 characters or less");
                if (req.uri && req.uri.length > 200)
                    throw new Error("URI must be 200 characters or less");
                if (req.imagePath) {
                    if (!fs_1.default.existsSync(req.imagePath))
                        req.imagePath = "../photo_2025-05-07_08-02-01.jpg";
                    const stats = fs_1.default.statSync(req.imagePath);
                    if (stats.size > 1000000)
                        throw new Error("Image file must be less than 1MB for Pinata free tier");
                }
                if (req.external_url && !/^(https?:\/\/)/.test(req.external_url)) {
                    throw new Error("external_url must be a valid URL");
                }
                let creatorKeypair;
                try {
                    const secretKey = bs58_1.default.decode(req.creatorKeypair);
                    if (secretKey.length !== 64)
                        throw new Error("Invalid creatorKeypair: must be 64 bytes");
                    creatorKeypair = web3_js_1.Keypair.fromSecretKey(secretKey);
                }
                catch (_a) {
                    throw new Error("Invalid creatorKeypair: must be base58-encoded private key");
                }
                let tokenMint;
                let bondingCurve;
                let associatedBondingCurve;
                let attempts = 0;
                const maxAttempts = 20;
                let bondingCurveInfo;
                let associatedBondingCurveInfo;
                let mintAccountInfo;
                do {
                    if (attempts >= maxAttempts) {
                        throw new Error("Failed to find unused mint or bonding curve accounts after maximum attempts");
                    }
                    tokenMint = web3_js_1.Keypair.generate();
                    bondingCurve = anchor_1.web3.PublicKey.findProgramAddressSync([this.SEEDS.BONDING_CURVE, tokenMint.publicKey.toBuffer()], this.programId)[0];
                    associatedBondingCurve = anchor_1.web3.PublicKey.findProgramAddressSync([
                        bondingCurve.toBuffer(),
                        this.SEEDS.ASSOCIATED_BONDING_CURVE_CONSTANT,
                        tokenMint.publicKey.toBuffer(),
                    ], new web3_js_1.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"))[0];
                    // Check if accounts already exist
                    mintAccountInfo = yield this.connection.getAccountInfo(tokenMint.publicKey);
                    bondingCurveInfo = yield this.connection.getAccountInfo(bondingCurve);
                    associatedBondingCurveInfo = yield this.connection.getAccountInfo(associatedBondingCurve);
                    attempts++;
                } while (mintAccountInfo !== null ||
                    bondingCurveInfo !== null ||
                    associatedBondingCurveInfo !== null);
                const lamports = yield (0, spl_token_1.getMinimumBalanceForRentExemptMint)(this.connection);
                const uri = req.uri || (yield this.uploadMetadata(req));
                const latestBlockhash = yield this.connection.getLatestBlockhash("confirmed");
                const mintInstruction = web3_js_1.SystemProgram.createAccount({
                    fromPubkey: creatorKeypair.publicKey,
                    newAccountPubkey: tokenMint.publicKey,
                    space: spl_token_1.MINT_SIZE,
                    lamports,
                    programId: spl_token_1.TOKEN_PROGRAM_ID,
                });
                const initializeMintInstruction = (0, spl_token_1.createInitializeMintInstruction)(tokenMint.publicKey, this.DECIMALS, creatorKeypair.publicKey, creatorKeypair.publicKey, spl_token_1.TOKEN_PROGRAM_ID);
                const pumpFunInstruction = yield this.createPumpFunInstruction(tokenMint.publicKey, creatorKeypair.publicKey, Object.assign(Object.assign({}, req), { uri }));
                const transaction = new web3_js_1.Transaction().add(mintInstruction, initializeMintInstruction, pumpFunInstruction);
                transaction.feePayer = creatorKeypair.publicKey;
                transaction.recentBlockhash = latestBlockhash.blockhash;
                transaction.sign(tokenMint, creatorKeypair);
                // Simulate the transaction for debugging
                const simulationResult = yield this.connection.simulateTransaction(transaction);
                console.log("Simulation Result:", JSON.stringify(simulationResult, null, 2));
                if (simulationResult.value.err) {
                    throw new Error(`Transaction simulation failed: ${JSON.stringify(simulationResult.value.err)}`);
                }
                const result = yield this.jitoBundler.executeAndConfirm(transaction, creatorKeypair, latestBlockhash);
                return {
                    success: result.confirmed,
                    signature: result.signature,
                    error: result.error,
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                };
            }
        });
    }
    uploadMetadata(req) {
        return __awaiter(this, void 0, void 0, function* () {
            const cacheKey = `${req.name}:${req.symbol}:${req.imagePath}:${req.description || ""}:${req.external_url || ""}:${JSON.stringify(req.attributes || [])}`;
            if (this.metadataCache.has(cacheKey)) {
                return this.metadataCache.get(cacheKey);
            }
            try {
                const imageFile = new File([fs_1.default.readFileSync(req.imagePath)], `${req.symbol}.png`, { type: "image/png" });
                const imageUpload = yield this.pinata.upload.public.file(imageFile);
                if (!imageUpload.cid) {
                    throw new Error("Failed to upload image to Pinata IPFS");
                }
                const imageUrl = `https://${process.env.PINATA_GATEWAY}/ipfs/${imageUpload.cid}`;
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
                const metadataUpload = yield this.pinata.upload.public.json(metadata);
                if (!metadataUpload.cid) {
                    throw new Error("Failed to upload metadata JSON to Pinata IPFS");
                }
                const uri = `https://${process.env.PINATA_GATEWAY}/ipfs/${metadataUpload.cid}`;
                this.metadataCache.set(cacheKey, uri);
                return uri;
            }
            catch (error) {
                throw new Error(`Pinata IPFS upload failed: ${error instanceof Error ? error.message : "Unknown error"}`);
            }
        });
    }
    createPumpFunInstruction(mint, creator, tokenData) {
        return __awaiter(this, void 0, void 0, function* () {
            const discriminator = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]);
            const mintAuthority = anchor_1.web3.PublicKey.findProgramAddressSync([this.SEEDS.MINT_AUTHORITY], this.programId)[0];
            const bondingCurve = anchor_1.web3.PublicKey.findProgramAddressSync([this.SEEDS.BONDING_CURVE, mint.toBuffer()], this.programId)[0];
            const associatedBondingCurve = anchor_1.web3.PublicKey.findProgramAddressSync([
                bondingCurve.toBuffer(),
                this.SEEDS.ASSOCIATED_BONDING_CURVE_CONSTANT,
                mint.toBuffer(),
            ], new web3_js_1.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"))[0];
            const global = anchor_1.web3.PublicKey.findProgramAddressSync([this.SEEDS.GLOBAL], this.programId)[0];
            const metadata = anchor_1.web3.PublicKey.findProgramAddressSync([
                anchor_1.utils.bytes.utf8.encode("metadata"),
                this.SEEDS.METADATA_CONSTANT,
                mint.toBuffer(),
            ], new web3_js_1.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"))[0];
            const eventAuthority = anchor_1.web3.PublicKey.findProgramAddressSync([this.SEEDS.EVENT_AUTHORITY], this.programId)[0];
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
                { pubkey: mint, isSigner: false, isWritable: true },
                { pubkey: mintAuthority, isSigner: false, isWritable: false },
                { pubkey: bondingCurve, isSigner: false, isWritable: true },
                { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
                { pubkey: global, isSigner: false, isWritable: false },
                {
                    pubkey: new web3_js_1.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
                    isSigner: false,
                    isWritable: false,
                },
                { pubkey: metadata, isSigner: false, isWritable: true },
                { pubkey: creator, isSigner: true, isWritable: true },
                { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: spl_token_1.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                {
                    pubkey: new web3_js_1.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
                    isSigner: false,
                    isWritable: false,
                },
                {
                    pubkey: new web3_js_1.PublicKey("SysvarRent111111111111111111111111111111111"),
                    isSigner: false,
                    isWritable: false,
                },
                { pubkey: eventAuthority, isSigner: false, isWritable: false },
                { pubkey: this.programId, isSigner: false, isWritable: false },
            ];
            return new web3_js_1.TransactionInstruction({
                keys: accounts,
                programId: this.programId,
                data,
            });
        });
    }
}
exports.TokenService = TokenService;
