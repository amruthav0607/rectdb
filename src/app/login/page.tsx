"use client";

import { useFormStatus } from "react-dom";
import { authenticate } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardContent, CardTitle, CardFooter } from "@/components/ui/card";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation"; // Correct import for App Router

function LoginButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Logging in..." : "Login"}
        </Button>
    );
}

export default function LoginPage() {
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const router = useRouter();

    async function clientAction(formData: FormData) {
        setErrorMessage(null);
        const result = await authenticate(undefined, formData);
        if (result) {
            setErrorMessage(result);
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Login</CardTitle>
                </CardHeader>
                <CardContent>
                    <form action={clientAction} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" name="email" type="email" placeholder="m@example.com" required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input id="password" name="password" type="password" required />
                        </div>
                        {errorMessage && (
                            <div className="text-sm text-red-500">
                                {errorMessage}
                            </div>
                        )}
                        <LoginButton />
                    </form>
                </CardContent>
                <CardFooter className="justify-center">
                    <p className="text-sm text-gray-500">Don&apos;t have an account? <Link href="/register" className="text-blue-500 hover:underline">Sign up</Link></p>
                </CardFooter>
            </Card>
        </div>
    );
}
