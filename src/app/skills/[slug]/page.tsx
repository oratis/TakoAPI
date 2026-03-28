"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  Heart,
  ExternalLink,
  Terminal,
  Copy,
  Check,
  Eye,
  ArrowLeft,
  Download,
  Star,
  BookOpen,
  Zap,
  AlertCircle,
  ListChecks,
  PlayCircle,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { Skill } from "@/lib/types";

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return n.toString();
}

/** Parse the structured readme into sections */
function parseReadme(readme: string | null) {
  if (!readme) return null;
  const sections: Record<string, string> = {};
  const parts = readme.split(/^## /m).filter(Boolean);
  for (const part of parts) {
    const newlineIdx = part.indexOf("\n");
    if (newlineIdx === -1) continue;
    const title = part.substring(0, newlineIdx).trim();
    const content = part.substring(newlineIdx + 1).trim();
    sections[title] = content;
  }
  return Object.keys(sections).length > 0 ? sections : null;
}

/** Render markdown-ish text as formatted list/paragraphs */
function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="space-y-1.5 ml-1">
          {listItems.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-600">
              <span className="text-purple-400 mt-0.5 shrink-0">&#8226;</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listItems.push(trimmed.substring(2));
    } else if (/^\d+[\.\)]\s/.test(trimmed)) {
      listItems.push(trimmed.replace(/^\d+[\.\)]\s*/, ""));
    } else {
      flushList();
      if (trimmed.length > 0) {
        elements.push(
          <p key={`p-${elements.length}`} className="text-sm text-gray-600 leading-relaxed">
            {trimmed}
          </p>
        );
      }
    }
  }
  flushList();

  return <div className="space-y-2.5">{elements}</div>;
}

/** Parse and render Example Workflow with INPUT / AGENT steps / OUTPUT styling */
function ExampleWorkflowContent({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let inputText = "";
  let outputText = "";
  const steps: string[] = [];
  let mode: "before" | "input" | "agent" | "output" = "before";

  for (const line of lines) {
    if (line === "INPUT") { mode = "input"; continue; }
    if (line === "AGENT") { mode = "agent"; continue; }
    if (line === "OUTPUT") { mode = "output"; continue; }

    if (mode === "input") {
      inputText += (inputText ? " " : "") + line;
    } else if (mode === "agent") {
      // Skip pure numbers (step numbers)
      if (/^\d+$/.test(line)) continue;
      steps.push(line);
    } else if (mode === "output") {
      outputText += (outputText ? " " : "") + line;
    }
  }

  // If no structured data found, show as plain text
  if (!inputText && steps.length === 0 && !outputText) {
    return <FormattedText text={text} />;
  }

  return (
    <div className="space-y-4">
      {/* INPUT */}
      {inputText && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded">INPUT</span>
          </div>
          <p className="text-sm text-gray-700">{inputText}</p>
        </div>
      )}

      {/* AGENT Steps */}
      {steps.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded">AGENT</span>
          </div>
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex items-start">
                  <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {step.split(/`([^`]+)`/).map((part, j) =>
                    j % 2 === 1 ? (
                      <code key={j} className="bg-gray-100 text-purple-700 px-1.5 py-0.5 rounded text-xs font-mono">
                        {part}
                      </code>
                    ) : (
                      <span key={j}>{part}</span>
                    )
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* OUTPUT */}
      {outputText && (
        <div className="rounded-lg border border-green-100 bg-green-50/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded">OUTPUT</span>
          </div>
          <p className="text-sm text-gray-700">{outputText}</p>
        </div>
      )}
    </div>
  );
}

export default function SkillDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: session } = useSession();
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/skills/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setSkill(data);
          setLikesCount(data.likesCount);
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const readmeSections = useMemo(() => parseReadme(skill?.readme ?? null), [skill?.readme]);

  const handleLike = async () => {
    if (!session) {
      window.location.href = "/auth/signin";
      return;
    }
    const res = await fetch(`/api/skills/${slug}/like`, { method: "POST" });
    const data = await res.json();
    setLiked(data.liked);
    setLikesCount((c) => c + (data.liked ? 1 : -1));
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
          <div className="h-32 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-lg text-gray-500">Skill not found</p>
        <Link href="/skills" className="text-purple-600 mt-2 inline-block">
          Back to skills
        </Link>
      </div>
    );
  }

  const whatItDoes = readmeSections?.["What This Skill Does"] ?? null;
  const whenToUseIt = readmeSections?.["When to Use It"] ?? null;
  const exampleWorkflow = readmeSections?.["Example Workflow"] ?? null;
  const requirements = readmeSections?.["Requirements"] ?? null;
  const hasStructuredData = !!(whatItDoes || exampleWorkflow || requirements);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/skills"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to skills
      </Link>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 sm:p-8 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                {skill.name}
              </h1>
              {skill.author && (
                <p className="text-sm text-gray-500 mt-1">by {skill.author}</p>
              )}
              <span className="inline-flex items-center mt-3 px-3 py-1 rounded-full text-xs bg-purple-50 text-purple-600 font-medium">
                {skill.category.name}
              </span>
            </div>

            <div className="flex items-center gap-3 flex-wrap justify-end">
              {skill.downloads > 0 && (
                <div className="flex items-center gap-1.5 text-sm text-gray-400" title="Downloads">
                  <Download className="h-4 w-4" />
                  {formatNumber(skill.downloads)}
                </div>
              )}
              {skill.stars > 0 && (
                <div className="flex items-center gap-1.5 text-sm text-gray-400" title="Stars">
                  <Star className="h-4 w-4" />
                  {formatNumber(skill.stars)}
                </div>
              )}
              <div className="flex items-center gap-1.5 text-sm text-gray-400" title="Views">
                <Eye className="h-4 w-4" />
                {formatNumber(skill.viewsCount)}
              </div>
              <button
                onClick={handleLike}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  liked
                    ? "bg-red-50 text-red-600 border border-red-200"
                    : "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-red-50 hover:text-red-600"
                }`}
              >
                <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
                {likesCount}
              </button>
            </div>
          </div>
        </div>

        {/* Brief */}
        <div className="p-6 sm:p-8 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Brief</h2>
          <p className="text-gray-600 leading-relaxed">
            {skill.brief || skill.description}
          </p>
        </div>

        {/* Description (full README) */}
        {skill.readme && (
          <div className="p-6 sm:p-8 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-purple-500" />
              Description
            </h2>
            {hasStructuredData ? (
              <div className="space-y-6">
                {/* What This Skill Does */}
                {whatItDoes && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">What This Skill Does</h3>
                    <FormattedText text={whatItDoes} />
                  </div>
                )}
                {/* When to Use It */}
                {whenToUseIt && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">When to Use It</h3>
                    <FormattedText text={whenToUseIt} />
                  </div>
                )}
              </div>
            ) : (
              <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-sans bg-gray-50 rounded-lg p-4 overflow-x-auto">
                {skill.readme}
              </pre>
            )}
          </div>
        )}

        {/* Example Workflow */}
        {exampleWorkflow && (
          <div className="p-6 sm:p-8 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-green-500" />
              Example Workflow
            </h2>
            <ExampleWorkflowContent text={exampleWorkflow} />
          </div>
        )}

        {/* Requirements */}
        {requirements && (
          <div className="p-6 sm:p-8 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Requirements
            </h2>
            <FormattedText text={requirements} />
          </div>
        )}

        {/* Installation */}
        <div className="p-6 sm:p-8 border-b border-gray-100 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            Installation
          </h2>

          {skill.installCmd && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">ClawHub CLI</label>
              <div className="flex items-center bg-gray-900 text-gray-100 rounded-lg overflow-hidden">
                <code className="flex-1 px-4 py-3 text-sm font-mono">
                  {skill.installCmd}
                </code>
                <button
                  onClick={() => copyToClipboard(skill.installCmd!, "cli")}
                  className="px-3 py-3 hover:bg-gray-800 transition-colors"
                >
                  {copied === "cli" ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4 text-gray-400" />
                  )}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              OpenClaw Chat (paste this into your conversation)
            </label>
            <div className="flex items-center bg-gray-900 text-gray-100 rounded-lg overflow-hidden">
              <code className="flex-1 px-4 py-3 text-sm font-mono">
                Install the skill from{" "}
                {skill.githubUrl || skill.clawHubUrl || skill.slug}
              </code>
              <button
                onClick={() =>
                  copyToClipboard(
                    `Install the skill from ${skill.githubUrl || skill.clawHubUrl || skill.slug}`,
                    "chat"
                  )
                }
                className="px-3 py-3 hover:bg-gray-800 transition-colors"
              >
                {copied === "chat" ? (
                  <Check className="h-4 w-4 text-green-400" />
                ) : (
                  <Copy className="h-4 w-4 text-gray-400" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Links */}
        <div className="p-6 sm:p-8 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Links</h2>
          <div className="flex flex-wrap gap-3">
            {skill.githubUrl && (
              <div className="inline-flex items-center rounded-lg border border-gray-200 overflow-hidden">
                <a
                  href={skill.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  GitHub
                </a>
                <button
                  onClick={() => copyToClipboard(skill.githubUrl!, "github-url")}
                  className="px-3 py-2 border-l border-gray-200 hover:bg-gray-50 transition-colors"
                  title="Copy GitHub URL"
                >
                  {copied === "github-url" ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4 text-gray-400" />
                  )}
                </button>
              </div>
            )}
            {(skill.clawHubUrl || skill.clawSkillsUrl) && (
              <a
                href={skill.clawHubUrl || skill.clawSkillsUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Terminal className="h-4 w-4" />
                ClawHub
                <ExternalLink className="h-3 w-3 text-gray-400" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
