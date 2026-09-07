import { getTranslations } from "next-intl/server";
import { AlertCircle, BookOpen, PlayCircle } from "lucide-react";

// The README half of the skill detail page.
//
// This markup used to live inside the page's client component, so the only real
// prose on ~5k skill pages was injected after a client-side fetch and never
// reached the HTML a crawler sees. None of it is interactive, so it renders on
// the server and ships no JS.

type Sections = Record<string, string>;

/** Split a structured README on its `## ` headings. */
function parseReadme(readme: string): Sections | null {
  const sections: Sections = {};
  const parts = readme.split(/^## /m).filter(Boolean);
  for (const part of parts) {
    const newlineIdx = part.indexOf("\n");
    if (newlineIdx === -1) continue;
    const title = part.substring(0, newlineIdx).trim();
    sections[title] = part.substring(newlineIdx + 1).trim();
  }
  return Object.keys(sections).length > 0 ? sections : null;
}

/** Bullets and paragraphs only — a full markdown renderer would cost more than the
 *  handful of constructs these READMEs actually use. */
function FormattedText({ text }: { text: string }) {
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    elements.push(
      <ul key={`list-${elements.length}`} className="space-y-1.5 ms-1">
        {listItems.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-gray-600">
            <span className="text-purple-500 mt-0.5 shrink-0" aria-hidden>
              &#8226;
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
    listItems = [];
  };

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listItems.push(trimmed.substring(2));
    } else if (/^\d+[.)]\s/.test(trimmed)) {
      listItems.push(trimmed.replace(/^\d+[.)]\s*/, ""));
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

type WorkflowLabels = { input: string; agent: string; output: string };

/** Renders the INPUT / AGENT / OUTPUT shape of an "Example Workflow" section. */
function ExampleWorkflowContent({ text, labels }: { text: string; labels: WorkflowLabels }) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let inputText = "";
  let outputText = "";
  const steps: string[] = [];
  let mode: "before" | "input" | "agent" | "output" = "before";

  // The markers are matched against the raw README (DB content), so the sentinels
  // stay literal English; only the rendered badges are translated by the caller.
  for (const line of lines) {
    if (line === "INPUT") { mode = "input"; continue; }
    if (line === "AGENT") { mode = "agent"; continue; }
    if (line === "OUTPUT") { mode = "output"; continue; }

    if (mode === "input") {
      inputText += (inputText ? " " : "") + line;
    } else if (mode === "agent") {
      if (/^\d+$/.test(line)) continue; // bare step numbers on their own line
      steps.push(line);
    } else if (mode === "output") {
      outputText += (outputText ? " " : "") + line;
    }
  }

  if (!inputText && steps.length === 0 && !outputText) {
    return <FormattedText text={text} />;
  }

  return (
    <div className="space-y-4">
      {inputText && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
          <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">{labels.input}</span>
          <p className="text-sm text-gray-700 mt-2">{inputText}</p>
        </div>
      )}

      {steps.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">{labels.agent}</span>
          <ol className="space-y-3 mt-3">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
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
              </li>
            ))}
          </ol>
        </div>
      )}

      {outputText && (
        <div className="rounded-lg border border-green-100 bg-green-50/50 p-4">
          <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded">{labels.output}</span>
          <p className="text-sm text-gray-700 mt-2">{outputText}</p>
        </div>
      )}
    </div>
  );
}

export async function SkillReadme({ readme }: { readme: string | null }) {
  if (!readme) return null;
  const t = await getTranslations("SkillDetail");

  // Section names are the literal English headings authors write in the README.
  const sections = parseReadme(readme);
  const whatItDoes = sections?.["What This Skill Does"] ?? null;
  const whenToUseIt = sections?.["When to Use It"] ?? null;
  const exampleWorkflow = sections?.["Example Workflow"] ?? null;
  const requirements = sections?.["Requirements"] ?? null;
  const structured = !!(whatItDoes || exampleWorkflow || requirements);

  return (
    <>
      <section className="p-6 sm:p-8 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-purple-500" aria-hidden />
          {t("description")}
        </h2>
        {structured ? (
          <div className="space-y-6">
            {whatItDoes && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t("whatThisSkillDoes")}</h3>
                <FormattedText text={whatItDoes} />
              </div>
            )}
            {whenToUseIt && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t("whenToUseIt")}</h3>
                <FormattedText text={whenToUseIt} />
              </div>
            )}
          </div>
        ) : (
          <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-sans bg-gray-50 rounded-lg p-4 overflow-x-auto">
            {readme}
          </pre>
        )}
      </section>

      {exampleWorkflow && (
        <section className="p-6 sm:p-8 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <PlayCircle className="h-4 w-4 text-green-600" aria-hidden />
            {t("exampleWorkflow")}
          </h2>
          <ExampleWorkflowContent
            text={exampleWorkflow}
            labels={{ input: t("workflowInput"), agent: t("workflowAgent"), output: t("workflowOutput") }}
          />
        </section>
      )}

      {requirements && (
        <section className="p-6 sm:p-8 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600" aria-hidden />
            {t("requirements")}
          </h2>
          <FormattedText text={requirements} />
        </section>
      )}
    </>
  );
}
