import React, { createContext, useContext, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";

export interface WorkspaceContextType {
  currentWorkspace: any | null;
  workspaces: any[];
  isLoading: boolean;
  switchWorkspace: (workspaceId: number) => void;
  refreshWorkspaces: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(
  undefined
);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [currentWorkspace, setCurrentWorkspace] = useState<any | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);

  // Fetch user's workspaces
  const { data: workspaces = [], isLoading, refetch } = trpc.workspace.list.useQuery();

  // Check if user needs migration
  const { data: needsMigration } = trpc.workspaceMigration.needsMigration.useQuery(
    undefined,
    { enabled: !isLoading } // only check after initial load
  );

  const migrateMutation = trpc.workspaceMigration.migrateToDefaultWorkspace.useMutation({
    onSuccess: () => {
      refetch(); // re-fetch workspaces after migration
      setIsMigrating(false);
    },
    onError: (err) => {
      console.error("[WorkspaceContext] Migration failed:", err);
      setIsMigrating(false);
    },
  });

  // Auto-migrate if user has no workspace
  useEffect(() => {
    if (!isLoading && needsMigration === true && !isMigrating) {
      setIsMigrating(true);
      migrateMutation.mutate();
    }
  }, [isLoading, needsMigration]);

  // Set default workspace once workspaces are loaded
  useEffect(() => {
    if (workspaces.length > 0 && !currentWorkspace) {
      const savedId = localStorage.getItem("currentWorkspaceId");
      const defaultWorkspace = savedId
        ? workspaces.find((w: any) => w.id === parseInt(savedId))
        : workspaces[0];

      if (defaultWorkspace) {
        setCurrentWorkspace(defaultWorkspace);
        localStorage.setItem("currentWorkspaceId", defaultWorkspace.id.toString());
      } else {
        // saved id not found, fall back to first workspace
        setCurrentWorkspace(workspaces[0]);
        localStorage.setItem("currentWorkspaceId", workspaces[0].id.toString());
      }
    }
  }, [workspaces, currentWorkspace]);

  const switchWorkspace = (id: number) => {
    const workspace = workspaces.find((w: any) => w.id === id);
    if (workspace) {
      setCurrentWorkspace(workspace);
      localStorage.setItem("currentWorkspaceId", id.toString());
    }
  };

  const refreshWorkspaces = () => {
    refetch();
  };

  return (
    <WorkspaceContext.Provider
      value={{
        currentWorkspace,
        workspaces,
        isLoading: isLoading || isMigrating,
        switchWorkspace,
        refreshWorkspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return context;
}
