import { Router } from "express";
import { adminLogin, getAdminStats, getAdminPayments } from "../controllers/adminController";
import { requireAdmin } from "../middlewares/adminAuth";
import { redeemTicket, verifyTicket } from "../controllers/ticketAdminController";

const router = Router();

router.post("/login", adminLogin);
router.get("/stats", requireAdmin, getAdminStats);
router.get("/payments", requireAdmin, getAdminPayments);
router.post("/tickets/verify", requireAdmin, verifyTicket);
router.post("/tickets/redeem", requireAdmin, redeemTicket);

export const adminRouter = router;

