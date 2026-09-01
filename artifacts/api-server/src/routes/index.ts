import { Router, type IRouter } from "express";
import healthRouter from "./health";
import grievanceRouter from "./grievances";

const router: IRouter = Router();

router.use(healthRouter);
router.use(grievanceRouter);

export default router;
