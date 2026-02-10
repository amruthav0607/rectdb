import Link from "next/link";
import { Button } from "@/components/ui/button";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    if (session.user.role === "admin") redirect("/admin");
    if (session.user.status === "active") redirect("/dashboard");
    if (session.user.status === "pending") redirect("/pending");
    if (session.user.status === "rejected") redirect("/rejected");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 text-gray-900">
      <main className="max-w-4xl mx-auto px-6 py-12 text-center space-y-8">
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">
          Neon Admin Dashboard
        </h1>

        <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
          The ultimate control center for your application. Manage users, monitor approvals,
          and scale your operations with a lightning-fast dashboard powered by Neon and Next.js.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
          <Link href="/register">
            <Button size="lg" className="px-8 py-6 text-lg rounded-full">
              Get Started
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="outline" size="lg" className="px-8 py-6 text-lg rounded-full border-2">
              Login to Workspace
            </Button>
          </Link>
        </div>

        <section id="features" className="pt-20 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold mb-2">Role-Based Access</h3>
            <p className="text-gray-500 text-sm">Secure routes for admins and users with custom permissions.</p>
          </div>
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold mb-2">Approval Workflow</h3>
            <p className="text-gray-500 text-sm">Review New account requests with a single click in the admin console.</p>
          </div>
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold mb-2">Instant Persistence</h3>
            <p className="text-gray-500 text-sm">Seamlessly sync data with Neon&apos;s serverless PostgreSQL database.</p>
          </div>
        </section>
      </main>

      <footer className="py-8 text-gray-400 text-sm">
        © 2026 Neon Admin Dash. All rights reserved.
      </footer>
    </div>
  );
}
