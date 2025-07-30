import BN from "bn.js";

export interface LaunchpadRequest {
  name: string;
  symbol: string;
  decimals?: number;
  description?: string;
  uri?: string;
  migrateType?: "amm" | "cpmm";
  slippage?: BN;
  buyAmount?: BN;
  imageBuffer?: Buffer;
  imageFileName?: string;
  external_url?: string;
  [key: string]: any;
}
