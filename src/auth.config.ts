import type { NextAuthConfig } from "next-auth";

export const authConfig = {
    pages: {
        signIn: "/login",
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const status = auth?.user?.status;
            const role = auth?.user?.role;

            const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
            const isOnAdmin = nextUrl.pathname.startsWith("/admin");
            const isOnStatusPage = ["/pending", "/rejected"].includes(nextUrl.pathname);

            if (isLoggedIn) {
                if (role !== "admin") {
                    if (status === "pending" && nextUrl.pathname !== "/pending") {
                        return Response.redirect(new URL("/pending", nextUrl));
                    }
                    if (status === "rejected" && nextUrl.pathname !== "/rejected") {
                        return Response.redirect(new URL("/rejected", nextUrl));
                    }
                    if (status === "active" && isOnStatusPage) {
                        return Response.redirect(new URL("/dashboard", nextUrl));
                    }
                }
            }

            if (isOnAdmin) {
                if (isLoggedIn && role === "admin") return true;
                return false;
            }

            if (isOnDashboard) {
                if (isLoggedIn && (status === "active" || role === "admin")) return true;
                return false;
            }
            return true;
        },
        jwt({ token, user }) {
            if (user) {
                token.role = user.role;
                token.status = user.status;
                token.id = user.id;
            }
            return token;
        },
        session({ session, token }) {
            if (token && session.user) {
                session.user.role = token.role as string;
                session.user.status = token.status as string;
                session.user.id = token.id as string;
            }
            return session;
        }
    },
    providers: [], // Add providers with an empty array for now
} satisfies NextAuthConfig;
