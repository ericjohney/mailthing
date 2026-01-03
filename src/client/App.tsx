import { useState, useCallback } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc, trpcClient } from "./trpc";
import { MailList } from "./components/mail-list";
import { MailDisplay } from "./components/mail-display";
import { Button } from "./components/ui/button";
import { Separator } from "./components/ui/separator";
import { TooltipProvider } from "./components/ui/tooltip";
import { RefreshCw, Trash2, Mail } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 5000,
    },
  },
});

function MailApp() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const messagesQuery = trpc.messages.list.useQuery();
  const messageQuery = trpc.messages.get.useQuery(
    { id: selectedId! },
    { enabled: selectedId !== null }
  );
  const deleteMutation = trpc.messages.delete.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries();
      setSelectedIds(new Set());
      if (selectedId && selectedIds.has(selectedId)) {
        setSelectedId(null);
      }
    },
  });

  const handleToggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!messagesQuery.data) return;
    if (selectedIds.size === messagesQuery.data.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(messagesQuery.data.map((m) => m.id)));
    }
  }, [messagesQuery.data, selectedIds.size]);

  const handleDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    deleteMutation.mutate({ ids: Array.from(selectedIds) });
  }, [selectedIds, deleteMutation]);

  const handleRefresh = useCallback(() => {
    messagesQuery.refetch();
  }, [messagesQuery]);

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col">
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <Mail className="h-6 w-6" />
            <h1 className="text-lg font-semibold">Mailthing</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleRefresh}>
              <RefreshCw className={`h-4 w-4 ${messagesQuery.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-[400px] border-r flex flex-col">
            <div className="flex items-center justify-between p-4 pb-2">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleSelectAll}>
                  {selectedIds.size === messagesQuery.data?.length && messagesQuery.data.length > 0
                    ? "Deselect all"
                    : "Select all"}
                </Button>
                {selectedIds.size > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {selectedIds.size} selected
                  </span>
                )}
              </div>
              {selectedIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Delete
                </Button>
              )}
            </div>
            <Separator />
            <div className="flex-1 overflow-hidden">
              <MailList
                messages={messagesQuery.data || []}
                selectedId={selectedId}
                selectedIds={selectedIds}
                onSelect={setSelectedId}
                onToggleSelect={handleToggleSelect}
              />
            </div>
          </div>

          {/* Detail view */}
          <div className="flex-1 overflow-hidden">
            <MailDisplay message={messageQuery.data} />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

export function App() {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <MailApp />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
