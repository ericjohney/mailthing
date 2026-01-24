import { cn, formatDate } from "../lib/utils";
import { ScrollArea } from "./ui/scroll-area";
import { Checkbox } from "./ui/checkbox";
import type { MessageSummary } from "../../shared/types";

interface MailListProps {
  messages: MessageSummary[];
  selectedId: number | null;
  selectedIds: Set<number>;
  onSelect: (id: number) => void;
  onToggleSelect: (id: number) => void;
}

export function MailList({
  messages,
  selectedId,
  selectedIds,
  onSelect,
  onToggleSelect,
}: MailListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-medium">No emails yet</p>
          <p className="text-sm">Send an email to localhost:2500 to see it here</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-2 p-4 pt-0">
        {messages.map((message) => (
          <button
            key={message.id}
            className={cn(
              "flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all hover:bg-accent",
              selectedId === message.id && "bg-muted"
            )}
            onClick={() => onSelect(message.id)}
          >
            <div className="flex w-full items-center gap-2">
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(message.id);
                }}
              >
                <Checkbox checked={selectedIds.has(message.id)} />
              </div>
              <div className="flex w-full flex-col gap-1">
                <div className="flex items-center">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold">{message.from || "(unknown)"}</div>
                  </div>
                  <div className="ml-auto text-xs text-muted-foreground">
                    {formatDate(message.date || message.receivedAt)}
                  </div>
                </div>
                <div className="text-xs font-medium">{message.subject}</div>
              </div>
            </div>
            <div className="line-clamp-1 text-xs text-muted-foreground">
              To: {message.to}
            </div>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
