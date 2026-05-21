import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Trash2, UserPlus } from "lucide-react";

interface TeamMembersProps {
  workspaceId: number;
}

export function TeamMembers({ workspaceId }: TeamMembersProps) {
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "member">("member");

  // Fetch members
  const { data: members = [] } = trpc.workspace.getMembers.useQuery({
    workspaceId,
  });

  // Fetch pending invitations
  const { data: pendingInvitations = [] } =
    trpc.workspaceMember.getPendingInvitations.useQuery({
      workspaceId,
    });

  // Mutations
  const inviteMutation = trpc.workspaceMember.invite.useMutation({
    onSuccess: () => {
      toast.success("Invitation sent successfully");
      setInviteEmail("");
      setInviteRole("member");
      setIsInviteOpen(false);
      trpc.useUtils().workspaceMember.getPendingInvitations.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send invitation");
    },
  });

  const removeMemberMutation = trpc.workspaceMember.removeMember.useMutation({
    onSuccess: () => {
      toast.success("Member removed successfully");
      trpc.useUtils().workspace.getMembers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to remove member");
    },
  });

  const updateRoleMutation = trpc.workspaceMember.updateRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated successfully");
      trpc.useUtils().workspace.getMembers.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update role");
    },
  });

  const cancelInvitationMutation =
    trpc.workspaceMember.cancelInvitation.useMutation({
      onSuccess: () => {
        toast.success("Invitation cancelled");
        trpc.useUtils().workspaceMember.getPendingInvitations.invalidate();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to cancel invitation");
      },
    });

  const handleInvite = () => {
    if (!inviteEmail) {
      toast.error("Please enter an email address");
      return;
    }

    inviteMutation.mutate({
      workspaceId,
      email: inviteEmail,
      role: inviteRole,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Team Members</h3>
        <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="w-4 h-4 mr-2" />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Send an invitation to join your workspace
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="member@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="role">Role</Label>
                <Select value={inviteRole} onValueChange={(value: any) => setInviteRole(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleInvite}
                disabled={inviteMutation.isPending}
                className="w-full"
              >
                {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Active Members */}
      <div>
        <h4 className="font-medium mb-3">Active Members</h4>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-gray-500">
                  No members yet
                </TableCell>
              </TableRow>
            ) : (
              members.map((member: any) => (
                <TableRow key={member.id}>
                  <TableCell>{member.email || "User"}</TableCell>
                  <TableCell>
                    <Select
                      value={member.role}
                      onValueChange={(value) =>
                        updateRoleMutation.mutate({
                          workspaceId,
                          userId: member.userId,
                          role: value as any,
                        })
                      }
                      disabled={member.role === "owner"}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {new Date(member.joinedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {member.role !== "owner" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          removeMemberMutation.mutate({
                            workspaceId,
                            userId: member.userId,
                          })
                        }
                        disabled={removeMemberMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <div>
          <h4 className="font-medium mb-3">Pending Invitations</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingInvitations.map((invitation: any) => (
                <TableRow key={invitation.id}>
                  <TableCell>{invitation.email}</TableCell>
                  <TableCell>{invitation.role}</TableCell>
                  <TableCell>
                    {new Date(invitation.expiresAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        cancelInvitationMutation.mutate({
                          invitationId: invitation.id,
                        })
                      }
                      disabled={cancelInvitationMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
