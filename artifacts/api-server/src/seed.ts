import { db } from "@workspace/db";
import {
  categoriesTable,
  grievancesTable,
  notificationsTable,
  statusHistoryTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID, scryptSync } from "node:crypto";

const hash = (password: string) => {
  const salt = randomUUID();
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
};
const uid = () => randomUUID();

export async function seedDatabase() {
  const existing = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
  if (existing.length) return;

  const categories = [
    ["Consent Related", "Questions about how consent was requested or recorded."],
    ["Data Privacy", "Concerns about handling or protecting personal data."],
    ["Unauthorized Data Processing", "Reports of data being used without permission."],
    ["Data Access", "Requests or issues related to accessing personal information."],
    ["Other", "Anything else that needs review."],
  ].map(([name, description]) => ({ id: uid(), name, description, isActive: true }));
  await db.insert(categoriesTable).values(categories);

  const admin = { id: uid(), name: "Avery Morgan", email: "admin@gms.demo", mobile: "9000000001", passwordHash: hash("Admin@123"), role: "ADMIN", isActive: true, department: "Central Review" };
  const officer = { id: uid(), name: "Jordan Lee", email: "officer@gms.demo", mobile: "9000000002", passwordHash: hash("Officer@123"), role: "OFFICER", isActive: true, department: "Privacy Department" };
  const citizen = { id: uid(), name: "Samira Patel", email: "user@gms.demo", mobile: "9000000003", passwordHash: hash("User@12345"), role: "USER", isActive: true, department: null };
  await db.insert(usersTable).values([admin, officer, citizen]);

  const now = Date.now();
  const examples = [
    { subject: "Consent record needs correction", categoryId: categories[0].id, status: "SUBMITTED", days: 0 },
    { subject: "Request for privacy policy clarification", categoryId: categories[1].id, status: "ACKNOWLEDGED", days: 2 },
    { subject: "Personal data used without consent", categoryId: categories[2].id, status: "ASSIGNED", days: 5 },
    { subject: "Unable to access my information", categoryId: categories[3].id, status: "IN_PROGRESS", days: 9 },
    { subject: "Old account data removal request", categoryId: categories[1].id, status: "RESOLVED", days: 14 },
    { subject: "Incorrect notification preferences", categoryId: categories[4].id, status: "CLOSED", days: 22 },
  ];
  for (let index = 0; index < examples.length; index += 1) {
    const example = examples[index];
    const createdAt = new Date(now - example.days * 86400000);
    const grievance = {
      id: uid(),
      grievanceId: `GRV-${createdAt.getFullYear()}-${String(100 + index).padStart(6, "0")}`,
      userId: citizen.id,
      categoryId: example.categoryId,
      subject: example.subject,
      description: "This is a seeded example grievance used to demonstrate the review process. It contains enough detail for an officer to investigate and respond.",
      relatedOrganization: "Example Services Ltd.",
      attachmentName: null,
      attachmentMimeType: null,
      attachmentSize: null,
      attachmentData: null,
      status: example.status,
      assignedDepartment: index >= 2 ? "Privacy Department" : null,
      assignedOfficerId: index >= 2 ? officer.id : null,
      resolution: ["RESOLVED", "CLOSED"].includes(example.status) ? "We reviewed the request and updated the relevant records. The citizen has been informed of the action taken." : null,
      internalNotes: null,
      resolvedAt: ["RESOLVED", "CLOSED"].includes(example.status) ? new Date(now - (example.days - 2) * 86400000) : null,
      closedAt: example.status === "CLOSED" ? new Date(now - (example.days - 1) * 86400000) : null,
      closedBy: example.status === "CLOSED" ? citizen.id : null,
      closureReason: example.status === "CLOSED" ? "Resolution accepted by citizen" : null,
      createdAt,
      updatedAt: createdAt,
    };
    await db.insert(grievancesTable).values(grievance);
    const path = ["SUBMITTED", "ACKNOWLEDGED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"];
    const end = path.indexOf(example.status);
    for (let step = 0; step <= end; step += 1) {
      await db.insert(statusHistoryTable).values({
        id: uid(),
        grievanceId: grievance.id,
        oldStatus: step === 0 ? null : path[step - 1],
        newStatus: path[step],
        changedBy: step >= 2 ? officer.id : citizen.id,
        comment: step === 0 ? "Grievance submitted" : step === end && example.status === "RESOLVED" ? "Resolution added" : null,
        createdAt: new Date(createdAt.getTime() + step * 86400000),
      });
    }
    await db.insert(notificationsTable).values({
      id: uid(),
      userId: citizen.id,
      grievanceId: grievance.id,
      title: example.status === "SUBMITTED" ? "Grievance submitted" : "Grievance update",
      message: `${grievance.grievanceId} is currently ${example.status.toLowerCase().replace("_", " ")}.`,
      isRead: index > 3,
      createdAt,
    });
  }
  await db.insert(notificationsTable).values({
    id: uid(),
    userId: admin.id,
    grievanceId: null,
    title: "Welcome to the review workspace",
    message: "Demo grievances are ready for review.",
    isRead: false,
  });
}

export async function ensureSeeded() {
  try {
    await seedDatabase();
  } catch {
    // The API can still start while the database is provisioning.
  }
}