import type { DecisionRequestView } from "company-core";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { diffLineKind, splitDiffByFile, truncationCopy } from "./view-model";

type Diff = NonNullable<DecisionRequestView["diff"]>;

// Worker cap (packages/git-adapter readDiff maxLines).
const LINE_CAP = 400;

const LINE_TINT = {
  add: "bg-[rgba(42,157,143,0.12)]",
  del: "bg-[rgba(214,40,40,0.14)]",
  hunk: "text-muted-foreground",
  file: "text-muted-foreground",
  context: "",
} as const;

// Every diff line is a React text node; the +/- character stays, so meaning never rests on colour alone.
export function DiffView({ diff }: { diff: Diff }) {
  const chunks = new Map(splitDiffByFile(diff.unified).map((c) => [c.path, c.lines]));
  const expandFirst = diff.files.length > 3;
  return (
    <div className="flex flex-col gap-2">
      {diff.truncated && (
        <Alert>
          <AlertDescription className="text-foreground">
            {truncationCopy({ lineCap: LINE_CAP, files: diff.files.length, added: diff.totalAdded, removed: diff.totalRemoved })}
          </AlertDescription>
        </Alert>
      )}
      <ul className="flex flex-col gap-2">
        {diff.files.map((file, i) => {
          const lines = chunks.get(file.path);
          return (
            <li key={file.path}>
              <Collapsible defaultOpen={expandFirst && i === 0} className="rounded-md border">
                <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none">
                  <span className="min-w-0 flex-1 truncate font-mono" title={file.path}>
                    {file.path}
                  </span>
                  <span className="text-[#2A9D8F]">+{file.added}</span>
                  <span className="text-[#FF8A80]">-{file.removed}</span>
                </CollapsibleTrigger>
                {lines && (
                  <CollapsibleContent>
                    <pre className="max-h-[480px] overflow-auto border-t font-mono text-xs leading-normal wrap-anywhere whitespace-pre-wrap">
                      {lines.map((line, n) => (
                        <div key={n} className={`px-1 ${LINE_TINT[diffLineKind(line)]}`}>
                          {line}
                          {"\n"}
                        </div>
                      ))}
                    </pre>
                  </CollapsibleContent>
                )}
              </Collapsible>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
