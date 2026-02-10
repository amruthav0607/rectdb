"use client";

import { useFormStatus } from "react-dom";
import { register } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardContent, CardTitle, CardFooter } from "@/components/ui/card";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Registering..." : "Register"}
        </Button>
    );
}

export default function RegisterPage() {
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    async function clientAction(formData: FormData) {
        const result = await register({
            email: formData.get("email") as string,
            password: formData.get("password") as string,
            name: formData.get("name") as string,
        });

        if (result?.error) {
            setError(result.error);
        } else {
            router.push("/login?registered=true");
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Create an account</CardTitle>
                </CardHeader>
                <CardContent>
                    <form action={clientAction} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Name</Label>
                            <Input id="name" name="name" placeholder="John Doe" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" name="email" type="email" placeholder="m@example.com" required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input id="password" name="password" type="password" required />
                        </div>
                        {error && <p className="text-sm text-red-500">{error}</p>}
                        <SubmitButton />
                    </form>
                </CardContent>
                <CardFooter className="justify-center">
                    <p className="text-sm text-gray-500">Already have an account? <Link href="/login" className="text-blue-500 hover:underline">Login</Link></p>
                </CardFooter>
            </Card>
        </div>
    );
}
