import { Model, DataTypes, Optional } from "sequelize";
import { sequelize } from "../database";

// Interface for the model's attributes
interface PumpfunTokensAttributes {
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
  bondingCurveAddress: string;
  associatedBondingCurveAddress: string;
  signature: string | null;
  createdAt: Date;
  updatedAt: Date;
  status: "bonding" | "graduated" | "failed";
  initialBuyAmount: number | null;
}

// Interface for creation attributes, with optional fields
interface PumpfunTokensCreationAttributes
  extends Optional<
    PumpfunTokensAttributes,
    | "id"
    | "initialMarketCap"
    | "currentMarketCap"
    | "imageUri"
    | "description"
    | "socialMedia"
    | "initialSupply"
    | "currentSupply"
    | "initialBuyAmount"
    | "status"
    | "signature"
  > {}

class PumpfunTokens
  extends Model<PumpfunTokensAttributes, PumpfunTokensCreationAttributes>
  implements PumpfunTokensAttributes
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
  public bondingCurveAddress!: string;
  public associatedBondingCurveAddress!: string;
  public signature!: string | null;
  public status!: "bonding" | "graduated" | "failed";
  public initialBuyAmount!: number | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

PumpfunTokens.init(
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
      comment:
        "The URI pointing to the token's metadata file (e.g., on Arweave or IPFS)",
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
        "JSON object for social media links (e.g., { 'twitter': '...', 'telegram': '...' })",
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
    bondingCurveAddress: {
      type: DataTypes.STRING(64),
      allowNull: false,
      comment: "The public key of the bonding curve program address",
    },
    associatedBondingCurveAddress: {
      type: DataTypes.STRING(64),
      allowNull: false,
      comment: "The public key of the associated bonding curve token account",
    },
    signature: {
      type: DataTypes.STRING(128),
      allowNull: true,
      comment: "The transaction signature for the token creation",
    },
    status: {
      type: DataTypes.ENUM("bonding", "graduated", "failed"),
      allowNull: false,
      defaultValue: "bonding",
      comment:
        "The current status of the token (on bonding curve, graduated to DEX, or failed)",
    },
    initialBuyAmount: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment: "The amount of SOL in lamports used for the initial buy, if any",
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "PumpfunTokens",
    tableName: "pumpfun_tokens",
    timestamps: true,
    hooks: {
      beforeCreate: (pumpfunToken: PumpfunTokens) => {},
    },
  }
);

export default PumpfunTokens;
