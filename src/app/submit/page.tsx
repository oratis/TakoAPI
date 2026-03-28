"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { Category } from "@/lib/types";

export default function SubmitPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [urlType, setUrlType] = useState<"github" | "clawskills">("github");
  const [form, setForm] = useState({
    name: "",
    description: "",
    githubUrl: "",
    clawSkillsUrl: "",
    categoryId: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then(setCategories);
  }, []);

  if (status === "loading") return null;
  if (!session) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">Submit a Skill</h1>
        <p className="text-gray-500 mb-6">Please sign in to submit skills.</p>
        <a
          href="/auth/signin"
          className="inline-flex bg-purple-600 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-purple-700"
        >
          Sign in
        </a>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const body: Record<string, string> = {
        name: form.name,
        description: form.description,
        categoryId: form.categoryId,
      };

      if (urlType === "github") {
        body.githubUrl = form.githubUrl;
      } else {
        body.clawSkillsUrl = form.clawSkillsUrl;
      }

      const res = await fetch("/api/skills/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit");
      }

      const skill = await res.json();
      router.push(`/skills/${skill.slug}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-1">Submit a Skill</h1>
      <p className="text-sm text-gray-500 mb-8">
        Share your OpenClaw skill with the community
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Skill Name
          </label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
            placeholder="e.g. my-awesome-skill"
          />
        </div>

        {/* URL Type Toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Skill Source
          </label>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setUrlType("github")}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                urlType === "github"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              GitHub URL
            </button>
            <button
              type="button"
              onClick={() => setUrlType("clawskills")}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                urlType === "clawskills"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              ClawSkills.sh URL
            </button>
          </div>

          {urlType === "github" ? (
            <input
              type="url"
              required
              value={form.githubUrl}
              onChange={(e) => setForm({ ...form, githubUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
              placeholder="https://github.com/username/repo"
            />
          ) : (
            <input
              type="url"
              required
              value={form.clawSkillsUrl}
              onChange={(e) => setForm({ ...form, clawSkillsUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
              placeholder="https://clawskills.sh/skills/author-skillname"
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Category
          </label>
          <select
            required
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none bg-white"
          >
            <option value="">Select a category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name} ({cat.skillCount})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            required
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none resize-none"
            placeholder="What does your skill do?"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-purple-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? "Submitting..." : "Submit Skill"}
        </button>
      </form>
    </div>
  );
}
