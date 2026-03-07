import { Router } from "express";
import { registerUser } from "../controllers/userController";
import { submitPayment } from "../controllers/paymentController";
import { upload } from "../middlewares/upload";

const router = Router();

router.post("/users/register", registerUser);
router.post("/payments/submit", upload.single("file"), submitPayment);

export const publicRouter = router;

