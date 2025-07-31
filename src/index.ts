import express from "express";
import dotenv from "dotenv";
import pumpfunRoutes from "./pumpfun/pumpfun.handler";
import { Router } from "express";

dotenv.config();

const app = express();
const router = Router();
router.use("/api", pumpfunRoutes);
app.use(express.json());
app.use(router);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
