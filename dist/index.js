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
const express_1 = __importDefault(require("express"));
const tokenService_1 = require("./pumpfun/tokenService");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use(express_1.default.json());
const tokenService = new tokenService_1.TokenService();
app.post("/api/create-token", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tokenData = req.body;
        // Normalize imagePath to use forward slashes
        if (tokenData.imagePath) {
            tokenData.imagePath = path_1.default
                .normalize(tokenData.imagePath)
                .replace(/\\/g, "/");
        }
        // Validate input
        if (!tokenData.name ||
            !tokenData.symbol ||
            !tokenData.creatorKeypair ||
            (!tokenData.uri && !tokenData.imagePath)) {
            return res.status(400).json({
                error: "Missing required fields: name, symbol, creatorKeypair, and either uri or imagePath",
            });
        }
        if (tokenData.name.length > 32) {
            return res
                .status(400)
                .json({ error: "Name must be 32 characters or less" });
        }
        if (tokenData.symbol.length > 8) {
            return res
                .status(400)
                .json({ error: "Symbol must be 8 characters or less" });
        }
        if (tokenData.uri && tokenData.uri.length > 200) {
            return res
                .status(400)
                .json({ error: "URI must be 200 characters or less" });
        }
        if (tokenData.external_url &&
            !/^(https?:\/\/)/.test(tokenData.external_url)) {
            return res
                .status(400)
                .json({ error: "external_url must be a valid URL" });
        }
        const result = yield tokenService.createPumpFunToken(tokenData);
        if (result.success) {
            res.json({ success: true, signature: result.signature });
        }
        else {
            res.status(500).json({ error: result.error || "Token creation failed" });
        }
    }
    catch (error) {
        res
            .status(500)
            .json({ error: error instanceof Error ? error.message : "Server error" });
    }
}));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
