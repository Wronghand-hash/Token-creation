import {
  BlockhashWithExpiryBlockHeight,
  Keypair,
  PublicKey,
  SystemProgram,
  Connection,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import axios, { AxiosError } from "axios";
import bs58 from "bs58";

export class JitoTransactionExecutor {
  private jitpTipAccounts = [
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
    "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
    "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  ];

  private JitoFeeWallet: PublicKey;

  constructor(
    private readonly jitoFee: string, // Jito fee in SOL (e.g., "0.0005")
    private readonly connection: Connection,
    private readonly jitoEndpoint: string // Jito bundle endpoint (e.g., "https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles")
  ) {
    this.JitoFeeWallet = this.getRandomValidatorKey();
  }

  private getRandomValidatorKey(): PublicKey {
    const randomValidator =
      this.jitpTipAccounts[
        Math.floor(Math.random() * this.jitpTipAccounts.length)
      ];
    return new PublicKey(randomValidator);
  }

  public async executeAndConfirm(
    transaction: VersionedTransaction, // Updated to accept VersionedTransaction
    feePayer: Keypair,
    latestBlockhash: BlockhashWithExpiryBlockHeight
  ): Promise<{ confirmed: boolean; signature?: string; error?: string }> {
    this.JitoFeeWallet = this.getRandomValidatorKey(); // Update wallet key each execution

    try {
      // Create Jito tip transaction
      const jitTipTxFeeMessage = new TransactionMessage({
        payerKey: feePayer.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [
          SystemProgram.transfer({
            fromPubkey: feePayer.publicKey,
            toPubkey: this.JitoFeeWallet,
            lamports: BigInt(Number(this.jitoFee) * 1_000_000_000), // Convert SOL to lamports
          }),
        ],
      }).compileToV0Message();

      const jitoFeeTx = new VersionedTransaction(jitTipTxFeeMessage);
      jitoFeeTx.sign([feePayer]);

      const jitoTxSignature = bs58.encode(jitoFeeTx.signatures[0]);

      // Serialize the transactions
      const serializedJitoFeeTx = bs58.encode(jitoFeeTx.serialize());
      const serializedTransaction = bs58.encode(transaction.serialize());

      console.log("Sending jito tip transaction...");
      const simMainTx = await this.connection.simulateTransaction(transaction);
      console.log(
        "Main transaction simulate =>",
        JSON.stringify(simMainTx, null, 2)
      );
      console.log({
        jitoTxSignature,
        txSign: bs58.encode(transaction.signatures[0]),
      });

      const serializedTransactions = [
        serializedJitoFeeTx,
        serializedTransaction,
      ];

      // Send bundle to Jito endpoint
      const response = await axios.post(this.jitoEndpoint, {
        jsonrpc: "2.0",
        id: 1,
        method: "sendBundle",
        params: [serializedTransactions],
      });

      const bundleId = response.data.result;
      console.log(`Bundle sent with ID: ${bundleId}`);

      console.log("Confirming jito tip transaction...");
      const feeTxSim = await this.connection.simulateTransaction(jitoFeeTx);
      console.log(
        "Fee transaction simulate =>",
        JSON.stringify(feeTxSim, null, 2)
      );

      // Confirm the transaction
      const confirmation = await this.confirm(jitoTxSignature, bundleId);

      return confirmation;
    } catch (error) {
      if (error instanceof AxiosError) {
        console.log(
          { error: error.response?.data },
          "Failed to execute Jito transaction"
        );
      }
      console.error("Error during transaction execution", error);
      return { confirmed: false, error: (error as Error).message };
    }
  }

  private async confirm(signature: string, bundleId: string) {
    // Wait for initial processing (adjust delay as needed)
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // Check bundle status
    const bundleStatusResponse = await axios.post(this.jitoEndpoint, {
      jsonrpc: "2.0",
      id: 1,
      method: "getBundleStatuses",
      params: [[bundleId]],
    });

    const bundleStatus = bundleStatusResponse.data.result.value[0];
    console.log(`Bundle status: ${JSON.stringify(bundleStatus, null, 2)}`);

    if (bundleStatus && bundleStatus.confirmation_status === "confirmed") {
      const confirmation = await this.connection.getSignatureStatus(signature);
      console.log(
        `Transaction confirmation: ${JSON.stringify(confirmation, null, 2)}`
      );

      if (confirmation.value?.confirmationStatus === "confirmed") {
        return { confirmed: true, signature };
      } else {
        return { confirmed: false, error: "Transaction not confirmed" };
      }
    }

    return {
      confirmed: false,
      error: `Bundle not confirmed: ${bundleStatus?.confirmation_status}`,
    };
  }
}
