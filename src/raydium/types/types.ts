import BN from "bn.js";

export interface LaunchpadRequest {
  name: string;
  symbol: string;
  decimals?: number;
  description?: string;
  uri?: string;
  migrateType?: "amm" | "cpmm";
  slippage?: BN;
  buyAmount?: number;
  imageBuffer?: Buffer;
  imageFileName?: string;
  external_url?: string;
  creatorKeypair?: string;
  [key: string]: any;
}
