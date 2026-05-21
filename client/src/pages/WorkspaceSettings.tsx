import { useWorkspace } from "@/contexts/WorkspaceContext";
import { TeamMembers } from "@/components/TeamMembers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState } from "react";

export default function WorkspaceSettings() {
  const { currentWorkspace } = useWorkspace();
  const [workspaceName, setWorkspaceName] = useState(
    currentWorkspace?.name || ""
  );
  const [workspaceDescription, setWorkspaceDescription] = useState(
    currentWorkspace?.description || ""
  );

  const updateWorkspaceMutation = trpc.workspace.update.useMutation({
    onSuccess: () => {
      toast.success("Workspace updated successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update workspace");
    },
  });

  const handleUpdateWorkspace = () => {
    if (!currentWorkspace) return;

    updateWorkspaceMutation.mutate({
      id: currentWorkspace.id,
      name: workspaceName,
      description: workspaceDescription,
    });
  };

  if (!currentWorkspace) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>No workspace selected</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Workspace Settings</h1>
        <p className="text-gray-600">Manage your workspace and team members</p>
      </div>

      {/* Workspace Details */}
      <Card>
        <CardHeader>
          <CardTitle>Workspace Details</CardTitle>
          <CardDescription>
            Update your workspace information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">Workspace Name</Label>
            <Input
              id="name"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={workspaceDescription}
              onChange={(e) => setWorkspaceDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <Button
            onClick={handleUpdateWorkspace}
            disabled={updateWorkspaceMutation.isPending}
          >
            {updateWorkspaceMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      {/* Team Members */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>
            Manage workspace members and permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TeamMembers workspaceId={currentWorkspace.id} />
        </CardContent>
      </Card>
    </div>
  );
}
