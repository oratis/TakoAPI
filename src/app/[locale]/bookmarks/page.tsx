import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import AgentCard from "@/components/ui/AgentCard";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Bookmarks" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

// The signed-in user's bookmarked agents. Server-rendered (auth + a direct
// AgentBookmark→Agent query), reusing the AgentCard grid. Un-bookmarking happens
// on each agent's detail page via the engagement bar.
export default async function BookmarksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Bookmarks");

  const session = await auth();
  if (!session?.user?.id) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">{t("title")}</h1>
        <p className="text-gray-500 mb-6">{t("signInPrompt")}</p>
        <Link
          href="/auth/signin"
          className="inline-flex bg-purple-600 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-purple-700"
        >
          {t("signIn")}
        </Link>
      </div>
    );
  }

  const rows = await prisma.agentBookmark.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      agent: {
        include: {
          category: { select: { name: true, slug: true } },
          _count: { select: { skills: true } },
        },
      },
    },
  });
  const agents = rows.map((r) => r.agent).filter((a) => a.status === "APPROVED");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-2xl font-bold mb-1">{t("title")}</h1>
      <p className="text-sm text-gray-500 mb-8">{t("subtitle")}</p>

      {agents.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl">
          <p className="text-gray-500">{t("empty")}</p>
          <Link href="/agents" className="text-purple-600 text-sm mt-1 inline-block">
            {t("browseAgents")} →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
      )}
    </div>
  );
}
