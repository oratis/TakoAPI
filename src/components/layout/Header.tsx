"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { Search, Menu, X, User, LogOut, Plus, TrendingUp, Shield } from "lucide-react";
import { useRouter } from "next/navigation";

export default function Header() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/skills?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🐙</span>
            <span className="text-xl font-bold bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
              TakoAPI
            </span>
          </Link>

          {/* Search bar - desktop */}
          <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-md mx-8">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-full border border-gray-300 bg-gray-50 focus:bg-white focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none transition-all text-sm"
              />
            </div>
          </form>

          {/* Nav links - desktop */}
          <nav className="hidden md:flex items-center gap-4">
            <Link href="/skills" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
              Browse
            </Link>
            <Link href="/agents" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
              Agents
            </Link>
            <Link href="/trending" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors">
              <TrendingUp className="h-3.5 w-3.5" />
              Trending
            </Link>
            <Link
              href="/submit"
              className="inline-flex items-center gap-1.5 text-sm bg-purple-600 text-white px-4 py-2 rounded-full hover:bg-purple-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Submit
            </Link>
            {session ? (
              <div className="relative group">
                <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
                  <User className="h-4 w-4" />
                  {session.user?.name || "Account"}
                </button>
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  <Link
                    href="/profile"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg"
                  >
                    My Skills
                  </Link>
                  {(session.user as { role?: string })?.role === "admin" && (
                    <Link
                      href="/admin"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Shield className="h-3.5 w-3.5" />
                      Admin Panel
                    </Link>
                  )}
                  <button
                    onClick={() => signOut()}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-b-lg flex items-center gap-2"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </div>
              </div>
            ) : (
              <Link href="/auth/signin" className="text-sm text-gray-600 hover:text-gray-900">
                Sign in
              </Link>
            )}
          </nav>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden pb-4 space-y-3">
            <form onSubmit={handleSearch}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search skills..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-full border border-gray-300 bg-gray-50 text-sm"
                />
              </div>
            </form>
            <div className="flex flex-col gap-2">
              <Link href="/skills" className="text-sm text-gray-600 py-1" onClick={() => setMenuOpen(false)}>
                Browse Skills
              </Link>
              <Link href="/agents" className="text-sm text-gray-600 py-1" onClick={() => setMenuOpen(false)}>
                Agents
              </Link>
              <Link href="/trending" className="text-sm text-gray-600 py-1 flex items-center gap-1" onClick={() => setMenuOpen(false)}>
                <TrendingUp className="h-3.5 w-3.5" />
                Trending
              </Link>
              <Link href="/submit" className="text-sm text-gray-600 py-1" onClick={() => setMenuOpen(false)}>
                Submit Skill
              </Link>
              {session ? (
                <>
                  <Link href="/profile" className="text-sm text-gray-600 py-1" onClick={() => setMenuOpen(false)}>
                    My Skills
                  </Link>
                  <button onClick={() => signOut()} className="text-left text-sm text-gray-600 py-1">
                    Sign out
                  </button>
                </>
              ) : (
                <Link href="/auth/signin" className="text-sm text-gray-600 py-1" onClick={() => setMenuOpen(false)}>
                  Sign in
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
