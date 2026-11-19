import { useState } from "react";
import { useAuthStore } from "../../stores/authStore.js";
import { ErrorBanner } from "../ui/Feedback.js";
import { ThemeToggle } from "../ui/ThemeToggle.js";

/**
 * Magic-link sign-in screen.
 *
 * The email is submitted to the server, which enforces the allowlist and asks
 * the provider to send the sign-in link.
 */
export function LoginScreen() {
  const requestMagicLink = useAuthStore((state) => state.requestMagicLink);
  const submitting = useAuthStore((state) => state.submitting);
  const error = useAuthStore((state) => state.error);
  const notice = useAuthStore((state) => state.notice);
  const clearError = useAuthStore((state) => state.clearError);

  const [email, setEmail] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await requestMagicLink(email);
  };

  return (
    <main className="relative flex min-h-full items-center justify-center px-4 py-12">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="eyebrow">Welcome back</div>
          <h1 className="mt-2 text-4xl font-medium tracking-tight text-ink">
            Dnnr<span className="text-clay">.</span>
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Sign in with your email to manage recipes and meal plans.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}

          {notice ? (
            <div
              role="status"
              className="rounded-2xl border border-sage-ink/25 bg-sage-soft px-3.5 py-2.5 text-sm text-sage-ink"
            >
              {notice}
            </div>
          ) : null}

          <div>
            <label className="label" htmlFor="login-email">
              Email address
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              className="input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={submitting || email.trim().length === 0}
          >
            {submitting ? "Sending…" : "Send sign-in link"}
          </button>

          <p className="text-center text-xs leading-relaxed text-muted">
            We will email you a link that signs you in. No password required.
          </p>
        </form>
      </div>
    </main>
  );
}
