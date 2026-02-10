import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
    const session = await auth();

    if (!session?.user) return null; // Should be handled by middleware

    return (
        <div className="flex min-h-screen flex-col items-center p-24 bg-gray-50">
            <Card className="w-full max-w-4xl">
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>User Dashboard</CardTitle>
                        <form action={async () => {
                            "use server"
                            await signOut();
                        }}>
                            <Button variant="destructive">Sign Out</Button>
                        </form>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <p>Welcome, <strong>{session.user.name || session.user.email}</strong>!</p>
                        <p>Your role: <span className="capitalize font-bold">{session.user.role}</span></p>
                        <p>Status: <span className={`capitalize font-bold ${session.user.status === 'active' ? 'text-green-600' : 'text-yellow-600'}`}>{session.user.status}</span></p>

                        {session.user.status === 'pending' && (
                            <div className="p-4 bg-yellow-100 text-yellow-800 rounded-md">
                                Your account is pending approval. You may not have access to all features.
                            </div>
                        )}

                        {session.user.role === 'admin' && (
                            <div className="mt-4">
                                <Button asChild>
                                    <a href="/admin">Go to Admin Dashboard</a>
                                </Button>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
