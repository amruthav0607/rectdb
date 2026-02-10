import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { handleSignOut } from "@/app/actions/auth";
import { YouTubeSummarizer } from "@/components/youtube-summarizer";

export default async function DashboardPage() {
    const session = await auth();

    if (!session?.user) return null;

    return (
        <div className="flex min-h-screen flex-col items-center p-8 sm:p-24 bg-gray-50">
            <div className="w-full max-w-4xl space-y-8">
                {/* User Info Card */}
                <Card className="w-full">
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle>User Dashboard</CardTitle>
                            <form action={handleSignOut}>
                                <Button variant="destructive" size="sm">Sign Out</Button>
                            </form>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <p>Welcome, <strong>{session.user.name || session.user.email}</strong>!</p>
                            <div className="flex gap-4 text-sm mt-2">
                                <span className="text-muted-foreground">Role: <strong className="capitalize text-foreground">{session.user.role}</strong></span>
                                <span className="text-muted-foreground">Status: <strong className={`capitalize ${session.user.status === 'active' ? 'text-green-600' : 'text-yellow-600'}`}>{session.user.status}</strong></span>
                            </div>

                            {session.user.status === 'pending' && (
                                <div className="p-4 bg-yellow-100 text-yellow-800 rounded-md mt-4 text-sm">
                                    Your account is pending approval. You may not have access to some premium features.
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* AI Tools Section */}
                <div className="space-y-4">
                    <h2 className="text-2xl font-bold tracking-tight">AI Tools</h2>
                    <YouTubeSummarizer />
                </div>

                {session.user.role === 'admin' && (
                    <div className="pt-4">
                        <Button asChild variant="outline" className="w-full sm:w-auto">
                            <a href="/admin">Go to Admin Dashboard Panel</a>
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
