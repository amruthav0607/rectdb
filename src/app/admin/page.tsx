import { auth, signOut } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AdminPage() {
    const session = await auth();

    if (session?.user?.role !== "admin") {
        return <div className="p-24 text-center">Unauthorized</div>;
    }

    const pendingUsers = await db.select().from(users).where(eq(users.status, "pending"));
    const allUsers = await db.select().from(users);

    async function approveUser(formData: FormData) {
        "use server";
        const userId = formData.get("userId") as string;
        await db.update(users).set({ status: "active" }).where(eq(users.id, userId));
        revalidatePath("/admin");
    }

    async function rejectUser(formData: FormData) {
        "use server";
        const userId = formData.get("userId") as string;
        await db.update(users).set({ status: "rejected" }).where(eq(users.id, userId));
        revalidatePath("/admin");
    }

    return (
        <div className="flex min-h-screen flex-col items-center p-24 bg-gray-50">
            <Card className="w-full max-w-6xl">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Admin Dashboard</CardTitle>
                    <form action={async () => {
                        "use server"
                        await signOut({ redirectTo: "/" });
                    }}>
                        <Button variant="outline">Sign Out</Button>
                    </form>
                </CardHeader>
                <CardContent>
                    <h2 className="text-xl font-semibold mb-4">Pending Approvals</h2>
                    {pendingUsers.length === 0 ? (
                        <p className="text-gray-500 mb-8">No pending users.</p>
                    ) : (
                        <Table className="mb-8">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pendingUsers.map((user) => (
                                    <TableRow key={user.id}>
                                        <TableCell>{user.email}</TableCell>
                                        <TableCell>{user.name}</TableCell>
                                        <TableCell>{user.createdAt.toLocaleDateString()}</TableCell>
                                        <TableCell className="flex gap-2">
                                            <form action={approveUser}>
                                                <input type="hidden" name="userId" value={user.id} />
                                                <Button size="sm" className="bg-green-600 hover:bg-green-700">Approve</Button>
                                            </form>
                                            <form action={rejectUser}>
                                                <input type="hidden" name="userId" value={user.id} />
                                                <Button size="sm" variant="destructive">Reject</Button>
                                            </form>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}

                    <h2 className="text-xl font-semibold mb-4 mt-8">All Users</h2>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Email</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {allUsers.map((user) => (
                                <TableRow key={user.id}>
                                    <TableCell>{user.email}</TableCell>
                                    <TableCell><Badge variant="outline">{user.role}</Badge></TableCell>
                                    <TableCell>
                                        <Badge variant={user.status === 'active' ? 'default' : user.status === 'pending' ? 'secondary' : 'destructive'}>
                                            {user.status}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
