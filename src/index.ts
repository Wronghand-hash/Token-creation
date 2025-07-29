import express from "express";
import dotenv from "dotenv";
import pumpfunRoutes from "./pumpfun/pumpfun.handler";
import raydiumRoutes from "./raydium/router/launchlab.router";
dotenv.config();

const app = express();

app.use(express.json());

app.use("/api", pumpfunRoutes);
app.use("/api", raydiumRoutes);
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
