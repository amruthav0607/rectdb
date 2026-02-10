"use server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function approveUser(formData: FormData) {
    const userId = formData.get("userId") as string;
    await db.update(users).set({ status: "active" }).where(eq(users.id, userId));
    revalidatePath("/admin");
}

export async function rejectUser(formData: FormData) {
    const userId = formData.get("userId") as string;
    await db.update(users).set({ status: "rejected" }).where(eq(users.id, userId));
    revalidatePath("/admin");
}
