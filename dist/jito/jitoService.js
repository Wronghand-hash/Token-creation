"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
exports.JitoBundler = void 0;
const axios_1 = __importStar(require("axios"));
const bs58_1 = __importDefault(require("bs58"));
const web3_js_1 = require("@solana/web3.js");
class JitoBundler {
    constructor(jitoFee, connection) {
        this.jitoFee = jitoFee;
        this.connection = connection;
        this.jitpTipAccounts = [
            "96gYZGLnJYVFmbjz256MhJNURt7z49g9aR3ouWHuFNUC",
            "Cw8CFyM9FkoMi7K7Cr9B2W6uW7V8KB8g4WPQJ2mu2mB",
        ];
        this.JitoFeeWallet = this.getRandomValidatorKey();
    }
    getRandomValidatorKey() {
        const randomValidator = this.jitpTipAccounts[Math.floor(Math.random() * this.jitpTipAccounts.length)];
        return new web3_js_1.PublicKey(randomValidator);
    }
    executeAndConfirm(transaction, feePayer, latestBlockhash) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            this.JitoFeeWallet = this.getRandomValidatorKey();
            try {
                const jitTipTxFeeMessage = new web3_js_1.TransactionMessage({
                    payerKey: feePayer.publicKey,
                    recentBlockhash: latestBlockhash.blockhash,
                    instructions: [
                        web3_js_1.SystemProgram.transfer({
                            fromPubkey: feePayer.publicKey,
                            toPubkey: this.JitoFeeWallet,
                            lamports: BigInt(this.jitoFee),
                        }),
                    ],
                }).compileToV0Message();
                const jitoFeeTx = new web3_js_1.VersionedTransaction(jitTipTxFeeMessage);
                jitoFeeTx.sign([feePayer]);
                const jitoTxsignature = bs58_1.default.encode(jitoFeeTx.signatures[0]);
                const serializedjitoFeeTx = bs58_1.default.encode(jitoFeeTx.serialize());
                const serializedTransaction0 = bs58_1.default.encode(transaction.serialize());
                console.log({
                    jitoTxsignature,
                    txSign: bs58_1.default.encode(transaction.signatures[0].signature),
                });
                const serializedTransactions = [
                    serializedjitoFeeTx,
                    serializedTransaction0,
                ];
                const endpoints = [
                    "https://necessary-wiser-mound.solana-mainnet.quiknode.pro/cc41531c946ca6662a805973099e2cf5778007f8",
                ];
                const requests = endpoints.map((url) => axios_1.default.post(url, {
                    jsonrpc: "2.0",
                    id: 1,
                    method: "sendBundle",
                    params: [serializedTransactions],
                }));
                const results = yield Promise.all(requests.map((p) => p.catch((e) => e)));
                const successfulResults = results.filter((result) => !(result instanceof Error));
                if (successfulResults.length > 0) {
                    return yield this.confirm(jitoTxsignature);
                }
                else {
                    console.debug("No successful responses received for jito");
                }
                return { confirmed: false };
            }
            catch (error) {
                if (error instanceof axios_1.AxiosError) {
                    console.log({ error: (_a = error.response) === null || _a === void 0 ? void 0 : _a.data }, "Failed to execute jito transaction");
                }
                console.error("Error during transaction execution", error);
                return { confirmed: false };
            }
        });
    }
    confirm(signature) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            yield new Promise((resolve) => setTimeout(resolve, 10000));
            const confirmation = yield this.connection.getSignatureStatus(signature);
            console.log(confirmation);
            if ((_a = confirmation.value) === null || _a === void 0 ? void 0 : _a.confirmationStatus)
                return { confirmed: true, signature };
            else {
                return { confirmed: false, error: "Transaction not confirmed" };
            }
        });
    }
}
exports.JitoBundler = JitoBundler;
