"use server";

import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";

const RegisterSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().optional(),
});

export async function register(formData: z.infer<typeof RegisterSchema>) {
    const validatedFields = RegisterSchema.safeParse(formData);

    if (!validatedFields.success) {
        return { error: "Invalid fields" };
    }

    const { email, password, name } = validatedFields.data;
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        const existingUser = await db.select().from(users).where(eq(users.email, email));
        if (existingUser.length > 0) {
            return { error: "Email already in use" };
        }

        // Check if this is the first user
        const allUsers = await db.select().from(users).limit(1);
        const isFirstUser = allUsers.length === 0;

        await db.insert(users).values({
            email,
            password: hashedPassword,
            name,
            role: isFirstUser ? "admin" : "user",
            status: isFirstUser ? "active" : "pending",
        });

        return { success: "User created!" };
    } catch (error) {
        console.error("Registration error:", error);
        return { error: "Something went wrong" };
    }
}

export async function authenticate(prevState: string | undefined, formData: FormData) {
    try {
        await signIn("credentials", Object.fromEntries(formData));
    } catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case "CredentialsSignin":
                    return "Invalid credentials.";
                default:
                    return "Something went wrong.";
            }
        }
        throw error;
    }
}
