import "dotenv/config";
import app from "./app.js";
import connectDB from "./config/db.js";
import { validateEnv } from "./config/env.js";
import { createServer } from "http";
import { initSocket } from "./services/socket.service.js";
import { initAssignmentScheduler } from "./services/assignmentService.js";
import { initLogisticsListeners } from "./events/index.js";

const PORT = process.env.PORT || 5000;
const httpServer = createServer(app);

// Initialize Socket.io
initSocket(httpServer);

const startServer = async () => {
  try {
    validateEnv();
    await connectDB();

    // Initialize logistics event bus (must be after connectDB — listeners may query DB)
    initLogisticsListeners();
    
    const { initializeEventRegistry } = await import("./events/eventRegistry.js");
    initializeEventRegistry();

    // Idempotent migration for existing brands
    try {
      const Brand = (await import("./models/Brand.model.js")).default;
      const updatedCount = await Brand.updateMany(
        { visibility: { $exists: false } },
        { $set: { visibility: "global", createdBy: "admin" } }
      );
      if (updatedCount.modifiedCount > 0) {
        console.log(`📦 Migrated ${updatedCount.modifiedCount} existing brands to default global settings.`);
      }
    } catch (err) {
      console.error("📦 Failed to run brand migration:", err);
    }

    // Seed default homepage sections
    try {
      const { seedHomepageSections } = await import("./scripts/seedHomeSections.js");
      await seedHomepageSections();
    } catch (err) {
      console.error("📦 Failed to run homepage sections seeding:", err);
    }

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
