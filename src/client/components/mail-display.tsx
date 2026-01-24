import { formatDate } from "../lib/utils";
import { Separator } from "./ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { ScrollArea } from "./ui/scroll-area";
import type { Message } from "../../shared/types";

interface MailDisplayProps {
  message: Message | null | undefined;
}

export function MailDisplay({ message }: MailDisplayProps) {
  if (!message) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>Select an email to view</p>
      </div>
    );
  }

  const { parsed } = message;
  const fromText = parsed.from?.text || "(unknown)";
  const toText = Array.isArray(parsed.to)
    ? parsed.to.map((t) => t.text).join(", ")
    : parsed.to?.text || "";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start p-4">
        <div className="flex items-start gap-4 text-sm">
          <div className="grid gap-1">
            <div className="font-semibold">{fromText}</div>
            <div className="line-clamp-1 text-xs">{parsed.subject}</div>
            <div className="line-clamp-1 text-xs text-muted-foreground">
              To: {toText}
            </div>
          </div>
        </div>
        {parsed.date && (
          <div className="ml-auto text-xs text-muted-foreground">
            {formatDate(parsed.date.toString())}
          </div>
        )}
      </div>
      <Separator />
      <Tabs defaultValue="html" className="flex-1 flex flex-col">
        <div className="px-4 pt-2">
          <TabsList>
            <TabsTrigger value="html">HTML</TabsTrigger>
            <TabsTrigger value="text">Text</TabsTrigger>
            <TabsTrigger value="source">Source</TabsTrigger>
            <TabsTrigger value="attachments">
              Attachments
              {parsed.attachments && parsed.attachments.length > 0 && (
                <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
                  {parsed.attachments.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="html" className="flex-1 m-0 p-0">
          <iframe
            src={`/api/message/${message.id}/html`}
            className="h-full w-full border-0"
            title="Email HTML content"
          />
        </TabsContent>
        <TabsContent value="text" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full p-4">
            <pre className="whitespace-pre-wrap text-sm">
              {parsed.text || "(no text content)"}
            </pre>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="source" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full p-4">
            <pre className="whitespace-pre-wrap text-xs font-mono">
              {message.raw}
            </pre>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="attachments" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full p-4">
            {!parsed.attachments || parsed.attachments.length === 0 ? (
              <p className="text-muted-foreground">No attachments</p>
            ) : (
              <div className="grid gap-2">
                {parsed.attachments.map((attachment, i) => (
                  <button
                    key={i}
                    className="flex items-center gap-2 rounded-lg border p-3 text-left hover:bg-accent"
                    onClick={() => {
                      const content = attachment.content;
                      const blob = new Blob(
                        [typeof content === "string" ? content : Buffer.from(content)],
                        { type: attachment.contentType }
                      );
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = attachment.filename || "attachment";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <div>
                      <div className="font-medium">{attachment.filename || "unnamed"}</div>
                      <div className="text-xs text-muted-foreground">
                        {attachment.contentType} · {attachment.size} bytes
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
