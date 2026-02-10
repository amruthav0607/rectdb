import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle, CardFooter } from "@/components/ui/card";
import Link from "next/link";
import { redirect } from "next/navigation";
import { handleSignOut } from "@/app/actions/auth";

export default async function PendingPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/login");
    }

    if (session.user.status === "active") {
        redirect("/dashboard");
    }

    if (session.user.status === "rejected") {
        redirect("/rejected");
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <CardTitle className="text-2xl text-yellow-600">Account Pending</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-gray-600">
                        Thank you for registering, <strong>{session.user.name || session.user.email}</strong>!
                    </p>
                    <p className="text-gray-600">
                        Your account is currently awaiting administrator approval. Please check back later.
                    </p>
                </CardContent>
                <CardFooter className="flex flex-col gap-2">
                    <form action={handleSignOut}>
                        <Button variant="outline" className="w-full">Sign Out</Button>
                    </form>
                    <Button asChild variant="link">
                        <Link href="/">Return to Home</Link>
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
