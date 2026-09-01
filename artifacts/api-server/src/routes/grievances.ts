import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import cookieParser from "cookie-parser";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "@workspace/db";
import {
  auditLogsTable,
  categoriesTable,
  grievancesTable,
  notificationsTable,
  sessionsTable,
  statusHistoryTable,
  usersTable,
  type User,
} from "@workspace/db";
import {
  AddAdminResolutionBody,
  AddOfficerResolutionBody,
  AdminChangeStatusBody,
  AssignGrievanceBody,
  CreateCategoryBody,
  CreateGrievanceBody,
  CreateOfficerBody,
  LoginBody,
  RegisterBody,
  SetUserActiveBody,
  UpdateCategoryBody,
  UpdateCurrentUserBody,
} from "@workspace/api-zod";

const router: IRouter = Router();
router.use(cookieParser());

const STATUSES = ["SUBMITTED", "ACKNOWLEDGED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
type Status = (typeof STATUSES)[number];
const NEXT_STATUS: Record<string, string[]> = {
  SUBMITTED: ["ACKNOWLEDGED"],
  ACKNOWLEDGED: ["ASSIGNED"],
  ASSIGNED: ["IN_PROGRESS"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
};

type AuthRequest = Request & { user?: User };
const cleanUser = (user: User) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  mobile: user.mobile,
  role: user.role,
  isActive: user.isActive,
  department: user.department,
  createdAt: user.createdAt.toISOString(),
});
const fail = (res: Response, status: number, message: string) => res.status(status).json({ message });
const id = () => randomUUID();
const hashPassword = (password: string) => {
  const salt = randomUUID();
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
};
const verifyPassword = (password: string, stored: string) => {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const target = Buffer.from(expected, "hex");
  return target.length === actual.length && timingSafeEqual(target, actual);
};
const createSession = async (res: Response, userId: string) => {
  const token = randomUUID();
  await db.insert(sessionsTable).values({
    token,
    userId,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
  });
  res.cookie("gms_session", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 24 * 14 });
};
const audit = async (actorId: string | null, action: string, entityType: string, entityId: string, details?: string) => {
  await db.insert(auditLogsTable).values({ id: id(), actorId, action, entityType, entityId, details: details ?? null });
};
const notify = async (userId: string, title: string, message: string, grievanceId?: string) => {
  await db.insert(notificationsTable).values({ id: id(), userId, grievanceId: grievanceId ?? null, title, message });
};
const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.cookies?.gms_session as string | undefined;
  if (!token) return fail(res, 401, "Your session has expired. Please log in again.");
  const rows = await db.select({ user: usersTable, session: sessionsTable }).from(sessionsTable).innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id)).where(eq(sessionsTable.token, token)).limit(1);
  const session = rows[0];
  if (!session || session.session.expiresAt < new Date() || !session.user.isActive) return fail(res, 401, "Your session has expired. Please log in again.");
  req.user = session.user;
  return next();
};
const allow = (...roles: string[]) => (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || !roles.includes(req.user.role)) return fail(res, 403, "You don't have permission to perform this action.");
  return next();
};
const parsePage = (value: unknown) => Math.max(1, Number(value ?? 1) || 1);
const parsePageSize = (value: unknown) => Math.min(100, Math.max(10, Number(value ?? 20) || 20));
const publicCategory = (category: typeof categoriesTable.$inferSelect) => ({ id: category.id, name: category.name, description: category.description, isActive: category.isActive });
const publicGrievance = (g: typeof grievancesTable.$inferSelect, category?: typeof categoriesTable.$inferSelect, officer?: User) => ({
  id: g.id,
  grievanceId: g.grievanceId,
  subject: g.subject,
  description: g.description,
  category: category ? publicCategory(category) : { id: g.categoryId, name: "Other", description: null, isActive: true },
  relatedOrganization: g.relatedOrganization,
  status: g.status,
  assignedDepartment: g.assignedDepartment,
  assignedOfficer: officer?.name ?? null,
  createdAt: g.createdAt.toISOString(),
  updatedAt: g.updatedAt.toISOString(),
  resolvedAt: g.resolvedAt?.toISOString() ?? null,
  closedAt: g.closedAt?.toISOString() ?? null,
});
const loadDetail = async (g: typeof grievancesTable.$inferSelect) => {
  const [userRows, categoryRows, officerRows, history, resolutionRows] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, g.userId)).limit(1),
    db.select().from(categoriesTable).where(eq(categoriesTable.id, g.categoryId)).limit(1),
    g.assignedOfficerId ? db.select().from(usersTable).where(eq(usersTable.id, g.assignedOfficerId)).limit(1) : Promise.resolve([]),
    db.select().from(statusHistoryTable).where(eq(statusHistoryTable.grievanceId, g.id)).orderBy(asc(statusHistoryTable.createdAt)),
    Promise.resolve([]),
  ]);
  const base = publicGrievance(g, categoryRows[0], officerRows[0]);
  return {
    ...base,
    user: userRows[0] ? cleanUser(userRows[0]) : { id: "", name: "Citizen", email: null, mobile: "", role: "USER", isActive: true, department: null, createdAt: g.createdAt.toISOString() },
    attachment: g.attachmentName ? { name: g.attachmentName, size: g.attachmentSize ?? 0, mimeType: g.attachmentMimeType ?? "application/octet-stream", url: `/api/grievances/${g.id}/attachment` } : null,
    history: history.map((h) => ({ id: h.id, oldStatus: h.oldStatus, newStatus: h.newStatus, changedBy: h.changedBy, comment: h.comment, createdAt: h.createdAt.toISOString() })),
    resolution: g.resolution ? { text: g.resolution, internalNotes: g.internalNotes, resolvedAt: g.resolvedAt?.toISOString() ?? g.updatedAt.toISOString(), resolvedBy: g.assignedOfficerId ?? "Administrator" } : null,
  };
};
const withFilters = (query: any, base: any[] = []) => {
  const conditions = [...base];
  const search = typeof query.search === "string" ? query.search.trim() : "";
  if (search) conditions.push(or(ilike(grievancesTable.grievanceId, `%${search}%`), ilike(grievancesTable.subject, `%${search}%`))!);
  if (typeof query.status === "string" && STATUSES.includes(query.status as Status)) conditions.push(eq(grievancesTable.status, query.status));
  if (typeof query.category === "string" && query.category) conditions.push(eq(grievancesTable.categoryId, query.category));
  if (typeof query.officer === "string" && query.officer) conditions.push(eq(grievancesTable.assignedOfficerId, query.officer));
  if (typeof query.department === "string" && query.department) conditions.push(eq(grievancesTable.assignedDepartment, query.department));
  return conditions.length ? and(...conditions) : undefined;
};
const listGrievances = async (query: any, base: any[] = []) => {
  const page = parsePage(query.page);
  const pageSize = parsePageSize(query.pageSize);
  const where = withFilters(query, base);
  const rows = await db.select({ grievance: grievancesTable, category: categoriesTable }).from(grievancesTable).leftJoin(categoriesTable, eq(grievancesTable.categoryId, categoriesTable.id)).where(where).orderBy(desc(grievancesTable.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  const totalRows = await db.select({ count: sql<number>`count(*)` }).from(grievancesTable).where(where);
  return { items: rows.map((r) => publicGrievance(r.grievance, r.category ?? undefined)), page, pageSize, total: Number(totalRows[0]?.count ?? 0), totalPages: Math.max(1, Math.ceil(Number(totalRows[0]?.count ?? 0) / pageSize)) };
};
const getOwned = async (user: User, grievanceId: string) => {
  const rows = await db.select().from(grievancesTable).where(eq(grievancesTable.id, grievanceId)).limit(1);
  const g = rows[0];
  if (!g) return null;
  if (user.role === "USER" && g.userId !== user.id) return null;
  if (user.role === "OFFICER" && g.assignedOfficerId !== user.id) return null;
  return g;
};
const applyStatus = async (g: typeof grievancesTable.$inferSelect, status: string, actor: User, comment?: string, override = false) => {
  if (!STATUSES.includes(status as Status)) throw new Error("That status is not valid.");
  if (!override && !NEXT_STATUS[g.status]?.includes(status)) throw new Error("This status change is not allowed yet.");
  await db.update(grievancesTable).set({ status, updatedAt: new Date(), resolvedAt: status === "RESOLVED" ? new Date() : g.resolvedAt, closedAt: status === "CLOSED" ? new Date() : g.closedAt, closedBy: status === "CLOSED" ? actor.id : g.closedBy }).where(eq(grievancesTable.id, g.id));
  await db.insert(statusHistoryTable).values({ id: id(), grievanceId: g.id, oldStatus: g.status, newStatus: status, changedBy: actor.id, comment: comment ?? null });
  await audit(actor.id, "CHANGE_STATUS", "GRIEVANCE", g.grievanceId, `${g.status} → ${status}`);
  if (g.userId !== actor.id) await notify(g.userId, "Grievance status updated", `Your grievance ${g.grievanceId} is now ${status.toLowerCase().replace("_", " ")}.`, g.id);
};

router.post("/auth/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success || parsed.data.password !== parsed.data.confirmPassword) return fail(res, 400, "Please check your details and make sure both passwords match.");
  const data = parsed.data;
  const existing = await db.select().from(usersTable).where(or(eq(usersTable.mobile, data.mobile), data.email ? eq(usersTable.email, data.email) : sql`false`)).limit(1);
  if (existing[0]) return fail(res, 409, "This email address or mobile number is already registered.");
  const user = { id: id(), name: data.name, email: data.email ?? null, mobile: data.mobile, passwordHash: hashPassword(data.password), role: "USER", isActive: true, department: null };
  await db.insert(usersTable).values(user);
  await audit(user.id, "REGISTER", "USER", user.id);
  await createSession(res, user.id);
  const [saved] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  return res.status(201).json({ user: cleanUser(saved) });
});
router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Enter your email or mobile number and password.");
  const rows = await db.select().from(usersTable).where(or(eq(usersTable.mobile, parsed.data.identifier), eq(usersTable.email, parsed.data.identifier))).limit(1);
  const user = rows[0];
  if (!user || !user.isActive || !verifyPassword(parsed.data.password, user.passwordHash)) return fail(res, 401, "We couldn't sign you in with those details.");
  await createSession(res, user.id);
  await audit(user.id, "LOGIN", "USER", user.id);
  return res.json({ user: cleanUser(user) });
});
router.post("/auth/logout", requireAuth, async (req: AuthRequest, res) => {
  const token = req.cookies?.gms_session as string | undefined;
  if (token) await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
  res.clearCookie("gms_session");
  return res.status(204).send();
});
router.get("/auth/me", requireAuth, (req: AuthRequest, res) => res.json(cleanUser(req.user!)));
router.put("/users/me", requireAuth, async (req: AuthRequest, res) => {
  const parsed = UpdateCurrentUserBody.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Please provide a valid name, email, and mobile number.");
  const duplicate = await db.select().from(usersTable).where(and(or(eq(usersTable.email, parsed.data.email ?? ""), eq(usersTable.mobile, parsed.data.mobile)), sql`${usersTable.id} <> ${req.user!.id}`)).limit(1);
  if (duplicate[0]) return fail(res, 409, "That email address or mobile number is already in use.");
  await db.update(usersTable).set({ name: parsed.data.name, email: parsed.data.email ?? null, mobile: parsed.data.mobile, updatedAt: new Date() }).where(eq(usersTable.id, req.user!.id));
  const [updated] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  return res.json(cleanUser(updated));
});

router.get("/categories", requireAuth, async (_req, res) => {
  const rows = await db.select().from(categoriesTable).where(eq(categoriesTable.isActive, true)).orderBy(asc(categoriesTable.name));
  return res.json(rows.map(publicCategory));
});
router.post("/grievances", requireAuth, allow("USER"), async (req: AuthRequest, res) => {
  const parsed = CreateGrievanceBody.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Please complete the required fields before submitting.");
  const data = parsed.data;
  const category = (await db.select().from(categoriesTable).where(and(eq(categoriesTable.id, data.categoryId), eq(categoriesTable.isActive, true))).limit(1))[0];
  if (!category) return fail(res, 400, "Please choose a valid category.");
  const year = new Date().getFullYear();
  const countRows = await db.select({ count: sql<number>`count(*)` }).from(grievancesTable).where(sql`extract(year from ${grievancesTable.createdAt}) = ${year}`);
  const sequence = Number(countRows[0]?.count ?? 0) + 1;
  const grievance = {
    id: id(),
    grievanceId: `GRV-${year}-${String(sequence).padStart(6, "0")}`,
    userId: req.user!.id,
    categoryId: data.categoryId,
    subject: data.subject,
    description: data.description,
    relatedOrganization: data.relatedOrganization ?? null,
    attachmentName: data.attachment?.name ?? null,
    attachmentMimeType: data.attachment?.mimeType ?? null,
    attachmentSize: data.attachment?.size ?? null,
    attachmentData: data.attachment?.dataUrl ?? null,
    status: "SUBMITTED",
    assignedDepartment: null,
    assignedOfficerId: null,
    resolution: null,
    internalNotes: null,
    resolvedAt: null,
    closedAt: null,
    closedBy: null,
    closureReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.insert(grievancesTable).values(grievance);
  await db.insert(statusHistoryTable).values({ id: id(), grievanceId: grievance.id, oldStatus: null, newStatus: "SUBMITTED", changedBy: req.user!.id, comment: "Grievance submitted" });
  await audit(req.user!.id, "CREATE_GRIEVANCE", "GRIEVANCE", grievance.grievanceId);
  const admins = await db.select().from(usersTable).where(and(eq(usersTable.role, "ADMIN"), eq(usersTable.isActive, true)));
  await Promise.all(admins.map((admin) => notify(admin.id, "New grievance submitted", `${req.user!.name} submitted ${grievance.grievanceId}.`, grievance.id)));
  return res.status(201).json(publicGrievance(grievance, category));
});
router.get("/my/grievances", requireAuth, allow("USER"), async (req: AuthRequest, res) => res.json(await listGrievances(req.query, [eq(grievancesTable.userId, req.user!.id)])));
router.get("/my/grievances/:id", requireAuth, allow("USER"), async (req: AuthRequest, res) => {
  const g = await getOwned(req.user!, String(req.params.id));
  return g ? res.json(await loadDetail(g)) : fail(res, 404, "The grievance could not be found.");
});
router.get("/grievances/:id", requireAuth, async (req: AuthRequest, res) => {
  const g = await getOwned(req.user!, String(req.params.id));
  return g ? res.json(await loadDetail(g)) : fail(res, 404, "The grievance could not be found.");
});
router.post("/my/grievances/:id/accept", requireAuth, allow("USER"), async (req: AuthRequest, res) => {
  const g = await getOwned(req.user!, String(req.params.id));
  if (!g) return fail(res, 404, "The grievance could not be found.");
  if (g.status !== "RESOLVED") return fail(res, 400, "This grievance is not ready to be closed.");
  await applyStatus(g, "CLOSED", req.user!);
  await audit(req.user!.id, "CLOSE_GRIEVANCE", "GRIEVANCE", g.grievanceId, "Resolution accepted by citizen");
  if (g.assignedOfficerId) await notify(g.assignedOfficerId, "Grievance closed", `${g.grievanceId} was closed after the resolution was accepted.`, g.id);
  const updated = (await db.select().from(grievancesTable).where(eq(grievancesTable.id, g.id)))[0];
  return res.json(await loadDetail(updated));
});

router.get("/admin/dashboard", requireAuth, allow("ADMIN"), async (_req, res) => {
  const all = await db.select().from(grievancesTable);
  const byStatus = STATUSES.map((status) => ({ status, count: all.filter((g) => g.status === status).length }));
  const categories = await db.select({ category: categoriesTable.name, count: sql<number>`count(${grievancesTable.id})` }).from(categoriesTable).leftJoin(grievancesTable, eq(categoriesTable.id, grievancesTable.categoryId)).groupBy(categoriesTable.name).orderBy(desc(sql`count(${grievancesTable.id})`));
  const recentRows = await db.select({ grievance: grievancesTable, category: categoriesTable }).from(grievancesTable).leftJoin(categoriesTable, eq(grievancesTable.categoryId, categoriesTable.id)).orderBy(desc(grievancesTable.createdAt)).limit(5);
  return res.json({ total: all.length, newCount: all.filter((g) => ["SUBMITTED", "ACKNOWLEDGED"].includes(g.status)).length, inProgress: all.filter((g) => ["ASSIGNED", "IN_PROGRESS"].includes(g.status)).length, resolved: all.filter((g) => g.status === "RESOLVED").length, closed: all.filter((g) => g.status === "CLOSED").length, byStatus, byCategory: categories.map((c) => ({ category: c.category, count: Number(c.count) })), recent: recentRows.map((r) => publicGrievance(r.grievance, r.category ?? undefined)) });
});
router.get("/admin/grievances", requireAuth, allow("ADMIN"), async (req, res) => res.json(await listGrievances(req.query)));
router.get("/admin/grievances/:id", requireAuth, allow("ADMIN"), async (req, res) => {
  const g = (await db.select().from(grievancesTable).where(eq(grievancesTable.id, String(req.params.id))).limit(1))[0];
  return g ? res.json(await loadDetail(g)) : fail(res, 404, "The grievance could not be found.");
});
router.post("/admin/grievances/:id/assign", requireAuth, allow("ADMIN"), async (req: AuthRequest, res) => {
  const parsed = AssignGrievanceBody.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Choose a department and an active officer.");
  const g = (await db.select().from(grievancesTable).where(eq(grievancesTable.id, String(req.params.id))).limit(1))[0];
  const officer = (await db.select().from(usersTable).where(and(eq(usersTable.id, parsed.data.officerId), eq(usersTable.role, "OFFICER"), eq(usersTable.isActive, true))).limit(1))[0];
  if (!g || !officer) return fail(res, 404, "That grievance or officer could not be found.");
  await db.update(grievancesTable).set({ assignedDepartment: parsed.data.department, assignedOfficerId: officer.id, status: g.status === "ACKNOWLEDGED" ? "ASSIGNED" : g.status, updatedAt: new Date() }).where(eq(grievancesTable.id, g.id));
  if (g.status === "ACKNOWLEDGED") await db.insert(statusHistoryTable).values({ id: id(), grievanceId: g.id, oldStatus: g.status, newStatus: "ASSIGNED", changedBy: req.user!.id, comment: `Assigned to ${officer.name}` });
  await audit(req.user!.id, "ASSIGN_OFFICER", "GRIEVANCE", g.grievanceId, `${parsed.data.department} / ${officer.name}`);
  await notify(officer.id, "New grievance assigned", `${g.grievanceId} has been assigned to you.`, g.id);
  await notify(g.userId, "Officer assigned", `An officer is now reviewing ${g.grievanceId}.`, g.id);
  const updated = (await db.select().from(grievancesTable).where(eq(grievancesTable.id, g.id)))[0];
  return res.json(await loadDetail(updated));
});
router.patch("/admin/grievances/:id/status", requireAuth, allow("ADMIN"), async (req: AuthRequest, res) => {
  const parsed = AdminChangeStatusBody.safeParse(req.body);
  const g = (await db.select().from(grievancesTable).where(eq(grievancesTable.id, String(req.params.id))).limit(1))[0];
  if (!g || !parsed.success) return fail(res, 400, "Please choose a valid status.");
  try { await applyStatus(g, parsed.data.status, req.user!, parsed.data.comment ?? undefined, true); } catch (error) { return fail(res, 400, error instanceof Error ? error.message : "Unable to update status."); }
  const updated = (await db.select().from(grievancesTable).where(eq(grievancesTable.id, g.id)))[0];
  return res.json(await loadDetail(updated));
});
router.post("/admin/grievances/:id/resolution", requireAuth, allow("ADMIN"), async (req: AuthRequest, res) => {
  const parsed = AddAdminResolutionBody.safeParse(req.body);
  const g = (await db.select().from(grievancesTable).where(eq(grievancesTable.id, String(req.params.id))).limit(1))[0];
  if (!g || !parsed.success) return fail(res, 400, "Please describe the resolution before saving it.");
  await db.update(grievancesTable).set({ resolution: parsed.data.resolution, internalNotes: parsed.data.internalNotes ?? null, status: "RESOLVED", resolvedAt: new Date(), updatedAt: new Date() }).where(eq(grievancesTable.id, g.id));
  await db.insert(statusHistoryTable).values({ id: id(), grievanceId: g.id, oldStatus: g.status, newStatus: "RESOLVED", changedBy: req.user!.id, comment: "Resolution added" });
  await audit(req.user!.id, "ADD_RESOLUTION", "GRIEVANCE", g.grievanceId);
  await notify(g.userId, "Resolution added", `A resolution is ready to view for ${g.grievanceId}.`, g.id);
  const updated = (await db.select().from(grievancesTable).where(eq(grievancesTable.id, g.id)))[0];
  return res.json(await loadDetail(updated));
});

router.get("/officer/dashboard", requireAuth, allow("OFFICER"), async (req: AuthRequest, res) => {
  const all = await db.select().from(grievancesTable).where(eq(grievancesTable.assignedOfficerId, req.user!.id));
  const recent = await listGrievances({}, [eq(grievancesTable.assignedOfficerId, req.user!.id)]);
  return res.json({ assigned: all.length, pending: all.filter((g) => ["ASSIGNED", "IN_PROGRESS"].includes(g.status)).length, inProgress: all.filter((g) => g.status === "IN_PROGRESS").length, resolved: all.filter((g) => g.status === "RESOLVED").length, recent: recent.items.slice(0, 5) });
});
router.get("/officer/grievances", requireAuth, allow("OFFICER"), async (req: AuthRequest, res) => res.json(await listGrievances(req.query, [eq(grievancesTable.assignedOfficerId, req.user!.id)])));
router.get("/officer/grievances/:id", requireAuth, allow("OFFICER"), async (req: AuthRequest, res) => {
  const g = await getOwned(req.user!, String(req.params.id));
  return g ? res.json(await loadDetail(g)) : fail(res, 404, "The grievance could not be found.");
});
router.patch("/officer/grievances/:id/status", requireAuth, allow("OFFICER"), async (req: AuthRequest, res) => {
  const parsed = AdminChangeStatusBody.safeParse(req.body);
  const g = await getOwned(req.user!, String(req.params.id));
  if (!g || !parsed.success) return fail(res, 400, "Please choose a valid status.");
  try { await applyStatus(g, parsed.data.status, req.user!, parsed.data.comment ?? undefined); } catch (error) { return fail(res, 400, error instanceof Error ? error.message : "Unable to update status."); }
  const updated = (await db.select().from(grievancesTable).where(eq(grievancesTable.id, g.id)))[0];
  return res.json(await loadDetail(updated));
});
router.post("/officer/grievances/:id/resolution", requireAuth, allow("OFFICER"), async (req: AuthRequest, res) => {
  const parsed = AddOfficerResolutionBody.safeParse(req.body);
  const g = await getOwned(req.user!, String(req.params.id));
  if (!g || !parsed.success) return fail(res, 400, "Please describe the resolution before saving it.");
  await db.update(grievancesTable).set({ resolution: parsed.data.resolution, internalNotes: parsed.data.internalNotes ?? null, status: "RESOLVED", resolvedAt: new Date(), updatedAt: new Date() }).where(eq(grievancesTable.id, g.id));
  await db.insert(statusHistoryTable).values({ id: id(), grievanceId: g.id, oldStatus: g.status, newStatus: "RESOLVED", changedBy: req.user!.id, comment: "Resolution added" });
  await audit(req.user!.id, "ADD_RESOLUTION", "GRIEVANCE", g.grievanceId);
  await notify(g.userId, "Resolution added", `A resolution is ready to view for ${g.grievanceId}.`, g.id);
  const updated = (await db.select().from(grievancesTable).where(eq(grievancesTable.id, g.id)))[0];
  return res.json(await loadDetail(updated));
});

router.get("/admin/users", requireAuth, allow("ADMIN"), async (req, res) => {
  const page = parsePage(req.query.page); const pageSize = parsePageSize(req.query.pageSize); const search = typeof req.query.search === "string" ? `%${req.query.search}%` : null;
  const where = and(req.query.role && ["USER", "ADMIN", "OFFICER"].includes(String(req.query.role)) ? eq(usersTable.role, String(req.query.role)) : undefined, search ? or(ilike(usersTable.name, search), ilike(usersTable.email, search), ilike(usersTable.mobile, search)) : undefined);
  const rows = await db.select().from(usersTable).where(where).orderBy(desc(usersTable.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  const total = Number((await db.select({ count: sql<number>`count(*)` }).from(usersTable).where(where))[0]?.count ?? 0);
  return res.json({ items: rows.map(cleanUser), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});
router.post("/admin/users", requireAuth, allow("ADMIN"), async (req: AuthRequest, res) => {
  const parsed = CreateOfficerBody.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "Please complete all officer details.");
  const existing = await db.select().from(usersTable).where(or(eq(usersTable.email, parsed.data.email), eq(usersTable.mobile, parsed.data.mobile))).limit(1);
  if (existing[0]) return fail(res, 409, "This email address or mobile number is already registered.");
  const officer = { id: id(), name: parsed.data.name, email: parsed.data.email, mobile: parsed.data.mobile, passwordHash: hashPassword(parsed.data.password), role: "OFFICER", isActive: true, department: parsed.data.department };
  await db.insert(usersTable).values(officer); await audit(req.user!.id, "CREATE_OFFICER", "USER", officer.id);
  return res.status(201).json(cleanUser(officer as User));
});
router.patch("/admin/users/:id/active", requireAuth, allow("ADMIN"), async (req: AuthRequest, res) => {
  const parsed = SetUserActiveBody.safeParse(req.body);
  const target = (await db.select().from(usersTable).where(eq(usersTable.id, String(req.params.id))).limit(1))[0];
  if (!target || !parsed.success) return fail(res, 400, "Unable to update this user.");
  if (target.role === "ADMIN" && !parsed.data.isActive) {
    const admins = await db.select().from(usersTable).where(and(eq(usersTable.role, "ADMIN"), eq(usersTable.isActive, true)));
    if (admins.length <= 1) return fail(res, 400, "The last active administrator cannot be deactivated.");
  }
  await db.update(usersTable).set({ isActive: parsed.data.isActive, updatedAt: new Date() }).where(eq(usersTable.id, target.id));
  await audit(req.user!.id, "UPDATE_USER", "USER", target.id, parsed.data.isActive ? "Activated" : "Deactivated");
  const updated = (await db.select().from(usersTable).where(eq(usersTable.id, target.id)))[0];
  return res.json(cleanUser(updated));
});
router.get("/admin/audit-logs", requireAuth, allow("ADMIN"), async (req, res) => {
  const page = parsePage(req.query.page); const pageSize = parsePageSize(req.query.pageSize);
  const rows = await db.select({ log: auditLogsTable, actor: usersTable }).from(auditLogsTable).leftJoin(usersTable, eq(auditLogsTable.actorId, usersTable.id)).orderBy(desc(auditLogsTable.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  const total = Number((await db.select({ count: sql<number>`count(*)` }).from(auditLogsTable))[0]?.count ?? 0);
  return res.json({ items: rows.map((r) => ({ id: r.log.id, actor: r.actor?.name ?? "System", action: r.log.action, entityType: r.log.entityType, entityId: r.log.entityId, details: r.log.details, createdAt: r.log.createdAt.toISOString() })), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});
router.post("/admin/categories", requireAuth, allow("ADMIN"), async (req: AuthRequest, res) => {
  const parsed = CreateCategoryBody.safeParse(req.body); if (!parsed.success) return fail(res, 400, "Please provide a category name.");
  const category = { id: id(), name: parsed.data.name, description: parsed.data.description ?? null, isActive: true };
  await db.insert(categoriesTable).values(category); await audit(req.user!.id, "CREATE_CATEGORY", "CATEGORY", category.id);
  return res.status(201).json(publicCategory(category as typeof categoriesTable.$inferSelect));
});
router.put("/admin/categories/:id", requireAuth, allow("ADMIN"), async (req: AuthRequest, res) => {
  const parsed = UpdateCategoryBody.safeParse(req.body); if (!parsed.success) return fail(res, 400, "Please provide a category name.");
  await db.update(categoriesTable).set({ name: parsed.data.name, description: parsed.data.description ?? null, updatedAt: new Date() }).where(eq(categoriesTable.id, String(req.params.id)));
  const category = (await db.select().from(categoriesTable).where(eq(categoriesTable.id, String(req.params.id))))[0]; if (!category) return fail(res, 404, "Category not found.");
  await audit(req.user!.id, "UPDATE_CATEGORY", "CATEGORY", category.id); return res.json(publicCategory(category));
});
router.delete("/admin/categories/:id", requireAuth, allow("ADMIN"), async (req: AuthRequest, res) => {
  await db.update(categoriesTable).set({ isActive: false, updatedAt: new Date() }).where(eq(categoriesTable.id, String(req.params.id))); await audit(req.user!.id, "UPDATE_CATEGORY", "CATEGORY", String(req.params.id), "Deactivated"); return res.status(204).send();
});
router.get("/notifications", requireAuth, async (req: AuthRequest, res) => {
  const rows = await db.select().from(notificationsTable).where(eq(notificationsTable.userId, req.user!.id)).orderBy(desc(notificationsTable.createdAt)).limit(50);
  return res.json(rows.map((n) => ({ id: n.id, grievanceId: n.grievanceId, title: n.title, message: n.message, isRead: n.isRead, createdAt: n.createdAt.toISOString() })));
});
router.patch("/notifications/:id/read", requireAuth, async (req: AuthRequest, res) => {
  await db.update(notificationsTable).set({ isRead: true }).where(and(eq(notificationsTable.id, String(req.params.id)), eq(notificationsTable.userId, req.user!.id)));
  const n = (await db.select().from(notificationsTable).where(eq(notificationsTable.id, String(req.params.id))))[0]; if (!n) return fail(res, 404, "Notification not found.");
  return res.json({ id: n.id, grievanceId: n.grievanceId, title: n.title, message: n.message, isRead: n.isRead, createdAt: n.createdAt.toISOString() });
});
router.patch("/notifications/read-all", requireAuth, async (req: AuthRequest, res) => { await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.userId, req.user!.id)); return res.status(204).send(); });
router.get("/grievances/:id/attachment", requireAuth, async (req: AuthRequest, res) => {
  const g = await getOwned(req.user!, String(req.params.id)); if (!g || !g.attachmentData) return fail(res, 404, "Attachment not found.");
  const match = g.attachmentData.match(/^data:([^;]+);base64,(.*)$/); if (!match) return fail(res, 400, "Attachment is not available.");
  res.setHeader("Content-Type", match[1]); res.setHeader("Content-Disposition", `inline; filename="${(g.attachmentName ?? "attachment").replace(/[^a-zA-Z0-9._-]/g, "_")}"`); return res.send(Buffer.from(match[2], "base64"));
});

export default router;