import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export function WorkspaceSwitcher() {
  const { currentWorkspace, workspaces, switchWorkspace, refreshWorkspaces } =
    useWorkspace();
  const utils = trpc.useUtils();
  const [isOpen, setIsOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newWorkspaceSlug, setNewWorkspaceSlug] = useState("");

  const createWorkspaceMutation = trpc.workspace.create.useMutation({
    onSuccess: async (data) => {
      toast.success(`Workspace "${data.name}" created successfully`);
      setNewWorkspaceName("");
      setNewWorkspaceSlug("");
      setIsOpen(false);
      // Await the refetch to guarantee the new workspace is in the list
      // before switching (more reliable than setTimeout)
      await utils.workspace.list.invalidate();
      refreshWorkspaces();
      switchWorkspace(data.id);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create workspace");
    },
  });

  const handleCreateWorkspace = () => {
    if (!newWorkspaceName || !newWorkspaceSlug) {
      toast.error("Please fill in all fields");
      return;
    }

    // Auto-sanitize slug
    const sanitizedSlug = newWorkspaceSlug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");

    createWorkspaceMutation.mutate({
      name: newWorkspaceName,
      slug: sanitizedSlug,
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        value={currentWorkspace?.id?.toString() || ""}
        onValueChange={(value) => switchWorkspace(parseInt(value))}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Select workspace" />
        </SelectTrigger>
        <SelectContent>
          {workspaces.map((workspace: any) => (
            <SelectItem key={workspace.id} value={workspace.id.toString()}>
              {workspace.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Plus className="w-4 h-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Workspace</DialogTitle>
            <DialogDescription>
              Create a new workspace for your team
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="ws-name">Workspace Name</Label>
              <Input
                id="ws-name"
                placeholder="My Team"
                value={newWorkspaceName}
                onChange={(e) => {
                  setNewWorkspaceName(e.target.value);
                  // Auto-generate slug from name
                  setNewWorkspaceSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, "-")
                      .replace(/-+/g, "-")
                      .replace(/^-|-$/g, "")
                  );
                }}
              />
            </div>
            <div>
              <Label htmlFor="ws-slug">Workspace Slug</Label>
              <Input
                id="ws-slug"
                placeholder="my-team"
                value={newWorkspaceSlug}
                onChange={(e) =>
                  setNewWorkspaceSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
                }
              />
              <p className="text-xs text-slate-500 mt-1">
                Auto-generated from name. Letters, numbers and hyphens only.
              </p>
            </div>
            <Button
              onClick={handleCreateWorkspace}
              disabled={createWorkspaceMutation.isPending}
              className="w-full"
            >
              {createWorkspaceMutation.isPending
                ? "Creating..."
                : "Create Workspace"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
