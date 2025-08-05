import { Model, DataTypes, Optional } from "sequelize";
import { sequelize } from "../database";

// Interface for the model's attributes
interface LaunchlabTokensAttributes {
  id: number;
  tokenMint: string;
  tokenName: string;
  tokenSymbol: string;
  creatorAddress: string;
  metadataUri: string;
  imageUri: string | null;
  description: string | null;
  socialMedia: object | null;
  initialMarketCap: number | null;
  currentMarketCap: number | null;
  initialSupply: number | null;
  currentSupply: number | null;
  platformId: string;
  configId: string;
  poolId: string;
  vaultA: string;
  vaultB: string;
  signature: string | null;
  status: "active" | "migrated" | "failed";
  initialBuyAmount: number | null;
  decimals: number;
  createdAt: Date;
  updatedAt: Date;
}

// Interface for creation attributes, with optional fields
interface LaunchlabTokensCreationAttributes
  extends Optional<
    LaunchlabTokensAttributes,
    | "id"
    | "imageUri"
    | "description"
    | "socialMedia"
    | "initialMarketCap"
    | "currentMarketCap"
    | "initialSupply"
    | "currentSupply"
    | "signature"
    | "initialBuyAmount"
  > {}

class LaunchlabTokens
  extends Model<LaunchlabTokensAttributes, LaunchlabTokensCreationAttributes>
  implements LaunchlabTokensAttributes
{
  public id!: number;
  public tokenMint!: string;
  public tokenName!: string;
  public tokenSymbol!: string;
  public creatorAddress!: string;
  public metadataUri!: string;
  public imageUri!: string | null;
  public description!: string | null;
  public socialMedia!: object | null;
  public initialMarketCap!: number | null;
  public currentMarketCap!: number | null;
  public initialSupply!: number | null;
  public currentSupply!: number | null;
  public platformId!: string;
  public configId!: string;
  public poolId!: string;
  public vaultA!: string;
  public vaultB!: string;
  public signature!: string | null;
  public status!: "active" | "migrated" | "failed";
  public initialBuyAmount!: number | null;
  public decimals!: number;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

LaunchlabTokens.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    tokenMint: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      comment: "The unique public key of the created token mint",
    },
    tokenName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    tokenSymbol: {
      type: DataTypes.STRING(8),
      allowNull: false,
    },
    creatorAddress: {
      type: DataTypes.STRING(64),
      allowNull: false,
      comment: "The public key of the wallet that created the token",
    },
    metadataUri: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "The URI pointing to the token's metadata file",
    },
    imageUri: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Direct URI for the token's image",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    socialMedia: {
      type: DataTypes.JSON,
      allowNull: true,
      comment:
        "JSON object for social media links (e.g., { website: '...', twitter: '...', telegram: '...' })",
    },
    initialMarketCap: {
      type: DataTypes.DECIMAL(20, 10),
      allowNull: true,
      comment: "The initial market cap of the token at creation",
    },
    currentMarketCap: {
      type: DataTypes.DECIMAL(20, 10),
      allowNull: true,
      comment: "The current market cap of the token",
    },
    initialSupply: {
      type: DataTypes.DECIMAL(20, 0),
      allowNull: true,
      comment: "The initial total supply of the token",
    },
    currentSupply: {
      type: DataTypes.DECIMAL(20, 0),
      allowNull: true,
      comment: "The current total supply of the token",
    },
    platformId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      comment: "The platform ID (e.g., BONK_PLATFROM_ID)",
    },
    configId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      comment: "The configuration ID for the launchpad",
    },
    poolId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      comment: "The pool ID for the launchpad",
    },
    vaultA: {
      type: DataTypes.STRING(64),
      allowNull: false,
      comment: "The vault address for the token mint",
    },
    vaultB: {
      type: DataTypes.STRING(64),
      allowNull: false,
      comment: "The vault address for the native mint (SOL)",
    },
    signature: {
      type: DataTypes.STRING(128),
      allowNull: true,
      comment: "The transaction signature for the token creation",
    },
    status: {
      type: DataTypes.ENUM("active", "migrated", "failed"),
      allowNull: false,
      defaultValue: "active",
      comment:
        "The current status of the token (active, migrated to AMM, or failed)",
    },
    initialBuyAmount: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment: "The amount of SOL in lamports used for the initial buy, if any",
    },
    decimals: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 6,
      comment: "The number of decimals for the token",
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "LaunchlabTokens",
    tableName: "launchlab_tokens",
    timestamps: true,
    hooks: {
      beforeCreate: (launchlabToken: LaunchlabTokens) => {},
    },
  }
);

export default LaunchlabTokens;
