import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const TOKEN_KEY = "reviveiq_auth_token";

interface LoginProps {
  onSuccess: () => void;
}

export default function Login({ onSuccess }: LoginProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  // Handle LinkedIn OAuth redirect — token comes back in URL params
  useState(() => {
    const params = new URLSearchParams(window.location.search);
    const linkedinToken = params.get("linkedin_token");
    const authError = params.get("auth_error");

    if (linkedinToken) {
      localStorage.setItem(TOKEN_KEY, linkedinToken);
      window.history.replaceState({}, "", window.location.pathname);
      onSuccess();
    } else if (authError) {
      const messages: Record<string, string> = {
        linkedin_denied: "LinkedIn sign-in was cancelled",
        state_mismatch: "Security check failed — please try again",
        token_failed: "LinkedIn authentication failed — please try again",
        profile_failed: "Could not get LinkedIn profile — please try again",
        no_email: "LinkedIn account has no email — please use email/password",
        server_error: "Server error — please try again",
      };
      toast.error(messages[authError] || "Authentication failed");
      window.history.replaceState({}, "", window.location.pathname);
    }
  });

  const handleLinkedIn = () => {
    window.location.href = "/api/auth/linkedin";
  };

  const handleSubmit = async () => {
    if (!email || !password || (mode === "register" && !name)) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body = mode === "login" ? { email, password } : { email, password, name };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Something went wrong");
        return;
      }

      // Store token in localStorage for reliable auth across Railway proxy
      if (data.token) {
        localStorage.setItem(TOKEN_KEY, data.token);
      }

      toast.success(mode === "login" ? "Welcome back!" : "Account created!");
      onSuccess();
    } catch {
      toast.error("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-gray-500 mt-1">
            {mode === "login" ? "Sign in to your pipeline" : "Start building your pipeline"}
          </p>
        </div>

        {/* LinkedIn OAuth Button */}
        <button
          onClick={handleLinkedIn}
          className="w-full flex items-center justify-center gap-3 bg-[#0077B5] hover:bg-[#006097] text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
          Continue with LinkedIn
        </button>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-3 bg-white text-gray-400">or continue with email</span>
          </div>
        </div>

        <div className="space-y-4">
          {mode === "register" && (
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                placeholder="Bryan Greer"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>
          <Button onClick={handleSubmit} disabled={loading} className="w-full">
            {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
          </Button>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          {mode === "login" ? (
            <>Don't have an account?{" "}
              <button onClick={() => setMode("register")} className="text-blue-600 hover:underline font-medium">Sign up</button>
            </>
          ) : (
            <>Already have an account?{" "}
              <button onClick={() => setMode("login")} className="text-blue-600 hover:underline font-medium">Sign in</button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
