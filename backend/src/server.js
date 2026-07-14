import "dotenv/config";
import app from "./app.js";
import connectDB from "./config/db.js";
import { validateEnv } from "./config/env.js";
import { createServer } from "http";
import { initSocket } from "./services/socket.service.js";
import { initAssignmentScheduler } from "./services/assignmentService.js";

const PORT = process.env.PORT || 5000;
const httpServer = createServer(app);

// Initialize Socket.io
initSocket(httpServer);

const startServer = async () => {
  try {
    validateEnv();
    await connectDB();
    initAssignmentScheduler();
    
    // Auto-release escrow scanner (run on startup and every 24 hours)
    const { releaseEscrowPayments } = await import("./cron/escrowCron.js");
    releaseEscrowPayments().catch(err => console.error("Escrow release scan error:", err));
    setInterval(() => {
      releaseEscrowPayments().catch(err => console.error("Escrow release scan error:", err));
    }, 24 * 60 * 60 * 1000);

    // Auto-expire promotional balances scanner (run on startup and every 24 hours)
    const { expirePromotionalBalances } = await import("./cron/walletCron.js");
    expirePromotionalBalances().catch(err => console.error("Wallet balance expiry scan error:", err));
    setInterval(() => {
      expirePromotionalBalances().catch(err => console.error("Wallet balance expiry scan error:", err));
    }, 24 * 60 * 60 * 1000);
    
    httpServer.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`🚀 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`🔌 Socket.io initialized`);
    });
  } catch (error) {
    console.error("📦 Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();

// Server initialized
